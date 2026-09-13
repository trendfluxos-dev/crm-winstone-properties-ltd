import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Call recording upload from the Winstone Connect Android app.
 *
 * Authentication: `x-device-token` (per-device, bound to one agent profile) or
 * the server-side INGEST_SECRET for trusted back-office callers.
 *
 * Audio is stored first and answered immediately; transcription + AI analysis
 * run afterwards through the durable queue (`analysis_status` on the row, swept
 * by /api/public/ingest/analyze), so a long call never holds the request open.
 *
 * Idempotency: `client_upload_id` is unique, so a WorkManager retry can never
 * create a second recording for the same file.
 */
const Payload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().min(5).optional(),
  agent_id: z.string().uuid().nullable().optional(),
  employee_id: z.string().min(2).max(20).nullable().optional(),
  /** The SIM the call was actually made from. */
  sim_number: z.string().trim().max(25).nullable().optional(),
  lead_name: z.string().trim().min(1).max(120).nullable().optional(),
  client_upload_id: z.string().trim().min(6).max(120).nullable().optional(),
  recorder_source: z.enum(["voice_call", "mic", "unknown"]).default("unknown"),
  audio_base64: z.string().min(1),
  file_extension: z.string().min(1).max(5).default("mp3"),
  duration_seconds: z.number().int().min(0),
  call_started_at: z.string().datetime({ offset: true }).nullable().optional(),
  call_direction: z.enum(["outgoing", "incoming_callback"]).default("outgoing"),
  is_two_sided: z.boolean().default(false),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
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

/** Multipart (preferred) or JSON+base64, so older builds keep working. */
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
    sim_number: text("sim_number"),
    lead_name: text("lead_name"),
    client_upload_id: text("client_upload_id"),
    recorder_source: text("recorder_source") ?? "unknown",
    audio_base64: toBase64(bytes),
    file_extension: ext.slice(0, 5),
    duration_seconds: Number(text("duration_seconds") ?? 0),
    call_started_at: text("call_started_at"),
    call_direction: text("call_direction") ?? "outgoing",
    is_two_sided: text("is_two_sided") === "true",
  });
}

export const Route = createFileRoute("/api/public/ingest/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const parsed = await readPayload(request);
        if (!parsed.success) {
          if ("oversize" in parsed) return json({ error: "Audio file too large" }, 413);
          return json({ error: "Invalid payload" }, 400);
        }
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Replay protection: same upload id -> same recording row.
        if (body.client_upload_id) {
          const { data: existing } = await supabaseAdmin
            .from("call_recordings")
            .select("id, analysis_status")
            .eq("client_upload_id", body.client_upload_id)
            .maybeSingle();
          if (existing) {
            return json(
              { recording_id: existing.id, duplicate: true, analysis: existing.analysis_status },
              200,
            );
          }
        }

        const { ingestRecording } = await import("@/lib/call-intel.server");
        const { resolveAgent, resolveLeadId } = await import("@/lib/ingest-resolve.server");
        const { bindAgentSim, resolveAgentBySim, simMatchesAgent } =
          await import("@/lib/agent-sim.server");

        let agent: { id: string } | null = null;
        if (caller.kind === "device") {
          // The SIM the call came from must belong to this desk.
          const simCheck = await simMatchesAgent({
            profileId: caller.profile.id,
            sim: body.sim_number ?? null,
          });
          if (!simCheck.ok) return json({ error: simCheck.reason }, 409);
          // First sync from an unbound SIM binds it to this desk.
          if (body.sim_number) {
            await bindAgentSim({
              profileId: caller.profile.id,
              sim: body.sim_number,
              deviceId: caller.device.id,
            });
          }
          agent = { id: caller.profile.id };
        } else {
          agent =
            (await resolveAgent({
              agentId: body.agent_id ?? null,
              employeeId: body.employee_id ?? null,
            })) ?? (await resolveAgentBySim(body.sim_number ?? null));
        }

        const { leadId } = await resolveLeadId({
          leadId: body.lead_id ?? null,
          phoneNumber: body.phone_number ?? null,
          agentId: agent?.id ?? null,
          source: "call",
          fallbackName: body.lead_name ?? null,
        });
        if (!leadId) return json({ error: "Unknown lead" }, 404);

        // Ownership is never moved by a sync: a lead already held by another
        // agent stays with them, and an unheld lead goes to the caller's desk.
        if (agent?.id) {
          const { data: leadOwner } = await supabaseAdmin
            .from("leads")
            .select("id, assigned_to, assigned_agent_id")
            .eq("id", leadId)
            .maybeSingle();
          const ownerId = leadOwner?.assigned_to ?? leadOwner?.assigned_agent_id ?? null;
          if (ownerId && ownerId !== agent.id) {
            return json(
              { error: "এই লিড অন্য এজেন্টের কাছে আছে — কল সিংক করা যাবে না", lead_id: leadId },
              409,
            );
          }
          if (!ownerId) {
            await supabaseAdmin
              .from("leads")
              .update({ assigned_to: agent.id, assigned_agent_id: agent.id })
              .eq("id", leadId);
          }
        }

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
            clientUploadId: body.client_upload_id ?? null,
            recorderSource: body.recorder_source,
            deviceId: caller.kind === "device" ? caller.device.id : null,
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
            detail: body.is_two_sided
              ? "দুই পক্ষের অডিও (ডিভাইস অনুমোদন করেছে)"
              : "এক পক্ষের অডিও — এই ফোনে কল অডিও পাওয়া যায়নি",
          });

          // Every completed call gets a reportable lifecycle, recording or not.
          if (agent?.id) {
            const { openCallReport } = await import("@/lib/call-reports.server");
            await openCallReport({
              leadId,
              agentId: agent.id,
              recordingId,
              deviceId: caller.kind === "device" ? caller.device.id : null,
              phoneNumber: body.phone_number ?? null,
              callStartedAt: body.call_started_at ?? null,
              durationSeconds: body.duration_seconds,
              connected: body.duration_seconds > 5,
            });
          }

          // Transcription + AI analysis must be awaited here: this runs on a
          // serverless worker that is torn down as soon as the response is
          // returned, so a fire-and-forget promise never completes. A bounded
          // race keeps the phone's upload fast; the cron sweep retries the rest.
          const { analyzeOne } = await import("@/lib/analysis-queue.server");
          await Promise.race([
            analyzeOne(recordingId).catch((error) =>
              console.error("[ingest] analysis failed", error),
            ),
            new Promise((resolve) => setTimeout(resolve, 25_000)),
          ]);

          // Google Drive copy is best-effort and only runs when IT switched it
          // on with a folder; a Drive failure never fails the phone's upload.
          void (async () => {
            try {
              const { getDriveBackupSettings, backupRecordingToDrive } =
                await import("@/lib/recording-drive.server");
              const settings = await getDriveBackupSettings();
              if (!settings.enabled || !settings.folderId) return;
              await backupRecordingToDrive(recordingId);
            } catch (error) {
              console.error("[ingest] drive backup failed", error);
            }
          })();

          return json({ recording_id: recordingId, analysis: "pending" }, 202);
        } catch (error) {
          console.error("[ingest] recording failed", error);
          return json({ error: "Recording could not be stored" }, 500);
        }
      },
    },
  },
});
