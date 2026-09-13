import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Retries transcription + AI analysis for calls whose audio reached the server
 * but whose intelligence never completed (upload finished, AI step failed).
 *
 * POST /api/public/ingest/reprocess  { recording_id? , limit? }
 * Header: x-ingest-secret
 */
const Payload = z.object({
  recording_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/ingest/reprocess")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const parsed = Payload.safeParse((await request.json().catch(() => null)) ?? {});
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processRecording } = await import("@/lib/call-intel.server");

        let ids: string[];
        if (parsed.data.recording_id) {
          ids = [parsed.data.recording_id];
        } else {
          const { data, error } = await supabaseAdmin
            .from("call_recordings")
            .select("id")
            .not("audio_url", "is", null)
            .or("sync_status.eq.failed,transcription_text.is.null")
            .order("created_at", { ascending: false })
            .limit(parsed.data.limit);
          if (error) return json({ error: error.message }, 500);
          ids = (data ?? []).map((row) => row.id);
        }

        const results: { recording_id: string; status: "complete" | "failed"; error?: string }[] =
          [];
        const { logLeadEvent } = await import("@/lib/lead-events.server");

        for (const id of ids) {
          try {
            await processRecording(id);
            const { data: rec } = await supabaseAdmin
              .from("call_recordings")
              .select("lead_id, agent_id")
              .eq("id", id)
              .maybeSingle();
            await logLeadEvent({
              leadId: rec?.lead_id ?? null,
              agentId: rec?.agent_id ?? null,
              recordingId: id,
              kind: "transcript_ready",
              detail: "পুনরায় চেষ্টায় ট্রান্সক্রিপ্ট তৈরি",
            });
            results.push({ recording_id: id, status: "complete" });
          } catch (error) {
            console.error("[reprocess] failed", id, error);
            results.push({
              recording_id: id,
              status: "failed",
              error: error instanceof Error ? error.message : "unknown",
            });
          }
        }

        return json({ processed: results.length, results });
      },
    },
  },
});
