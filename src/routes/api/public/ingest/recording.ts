import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Payload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().min(5).optional(),
  agent_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().min(2).max(20).nullable().optional(),
  lead_name: z.string().trim().min(1).max(120).nullable().optional(),
  audio_base64: z.string().min(1),
  file_extension: z.string().min(1).max(5).default("mp3"),
  duration_seconds: z.number().int().min(0),
  call_direction: z.enum(["outgoing", "incoming_callback"]).default("outgoing"),
  is_two_sided: z.boolean().default(true),
});

function authorized(request: Request): boolean {
  const secret = process.env["INGEST_SECRET"];
  const provided = request.headers.get("x-ingest-secret") ?? "";
  if (!secret || provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

/**
 * The phone app may post the audio either as multipart/form-data (preferred:
 * the raw file streams straight through) or as JSON with base64 audio.
 */
async function readPayload(request: Request) {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Payload.safeParse(await request.json().catch(() => null));
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Payload.safeParse(null);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Payload.safeParse(null);
  if (file.size > MAX_AUDIO_BYTES) return { success: false as const, error: null, oversize: true };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  };
  const nameParts = (file.name || "recording.m4a").split(".");
  const ext = text("file_extension") ?? (nameParts.length > 1 ? nameParts.pop()! : "m4a");

  return Payload.safeParse({
    lead_id: text("lead_id"),
    phone_number: text("phone_number"),
    agent_id: text("agent_id"),
    employee_id: text("employee_id"),
    lead_name: text("lead_name"),
    audio_base64: toBase64(bytes),
    file_extension: ext.slice(0, 5),
    duration_seconds: Number(text("duration_seconds") ?? 0),
    call_direction: text("call_direction") ?? "outgoing",
    is_two_sided: text("is_two_sided") !== "false",
  });
}

export const Route = createFileRoute("/api/public/ingest/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const parsed = await readPayload(request);
        if (!parsed.success) {
          if ("oversize" in parsed) return json({ error: "Audio file too large" }, 413);
          return json({ error: "Invalid payload" }, 400);
        }
        const body = parsed.data;

        const { ingestRecording, processRecording } = await import("@/lib/call-intel.server");
        const { resolveAgent, resolveLeadId } = await import("@/lib/ingest-resolve.server");

        const agent = await resolveAgent({
          agentId: body.agent_id ?? null,
          employeeId: body.employee_id ?? null,
        });

        const { leadId } = await resolveLeadId({
          leadId: body.lead_id ?? null,
          phoneNumber: body.phone_number ?? null,
          agentId: agent?.id ?? null,
          source: "call",
          fallbackName: body.lead_name ?? null,
        });
        if (!leadId) return json({ error: "Unknown lead" }, 404);

        const { logLeadEvent } = await import("@/lib/lead-events.server");

        try {
          const recordingId = await ingestRecording({
            leadId,
            agentId: agent?.id ?? null,
            audioBase64: body.audio_base64,
            fileExtension: body.file_extension,
            durationSeconds: body.duration_seconds,
            direction: body.call_direction,
            isTwoSided: body.is_two_sided,
          });

          if (body.duration_seconds > 10) {
            await logLeadEvent({
              leadId,
              agentId: agent?.id ?? null,
              recordingId,
              kind: "call_connected",
              detail: `${body.duration_seconds} সেকেন্ড কথা হয়েছে`,
            });
          }
          await logLeadEvent({
            leadId,
            agentId: agent?.id ?? null,
            recordingId,
            kind: "recording_saved",
            detail: body.is_two_sided ? "দুই পক্ষের অডিও" : "এক পক্ষের অডিও",
          });

          try {
            await processRecording(recordingId);
          } catch (aiError) {
            console.error("[ingest] AI analysis failed", aiError);
            await logLeadEvent({
              leadId,
              agentId: agent?.id ?? null,
              recordingId,
              kind: "transcript_failed",
              detail: "এআই বিশ্লেষণ ব্যর্থ — পরে আবার চেষ্টা হবে",
            });
            return json({ recording_id: recordingId, analysis: "failed" }, 202);
          }

          await logLeadEvent({
            leadId,
            agentId: agent?.id ?? null,
            recordingId,
            kind: "transcript_ready",
            detail: "ট্রান্সক্রিপ্ট ও এআই বিশ্লেষণ তৈরি",
          });

          return json({ recording_id: recordingId, analysis: "complete" }, 201);
        } catch (error) {
          console.error("[ingest] recording failed", error);
          return json({ error: error instanceof Error ? error.message : "Ingest failed" }, 500);
        }
      },
    },
  },
});
