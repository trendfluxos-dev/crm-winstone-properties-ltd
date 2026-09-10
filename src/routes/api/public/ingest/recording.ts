import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Payload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().min(5).optional(),
  agent_id: z.string().uuid().nullable().optional(),
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

export const Route = createFileRoute("/api/public/ingest/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { ingestRecording, processRecording } = await import("@/lib/call-intel.server");

        let leadId = body.lead_id ?? null;
        if (!leadId && body.phone_number) {
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id")
            .eq("phone_number", body.phone_number)
            .maybeSingle();
          leadId = lead?.id ?? null;
        }
        if (!leadId) return json({ error: "Unknown lead" }, 404);

        try {
          const recordingId = await ingestRecording({
            leadId,
            agentId: body.agent_id ?? null,
            audioBase64: body.audio_base64,
            fileExtension: body.file_extension,
            durationSeconds: body.duration_seconds,
            direction: body.call_direction,
            isTwoSided: body.is_two_sided,
          });

          try {
            await processRecording(recordingId);
          } catch (aiError) {
            console.error("[ingest] AI analysis failed", aiError);
            return json({ recording_id: recordingId, analysis: "failed" }, 202);
          }

          return json({ recording_id: recordingId, analysis: "complete" }, 201);
        } catch (error) {
          console.error("[ingest] recording failed", error);
          return json({ error: error instanceof Error ? error.message : "Ingest failed" }, 500);
        }
      },
    },
  },
});
