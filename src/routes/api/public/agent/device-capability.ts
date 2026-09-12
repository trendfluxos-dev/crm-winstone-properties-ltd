import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Automatic recording-capability beacon from Winstone Connect.
 *
 * POST /api/public/agent/device-capability
 * Header: x-device-token
 * Body: { recording_mode, recording_note?, app_version?, android_version?, manufacturer?, model? }
 *
 * The phone probes its own recorder (call audio vs microphone vs blocked) and
 * posts the honest result here, so the IT Console shows the real state of every
 * agent phone instead of assuming recording works. Idempotent: posting the same
 * result again only refreshes the timestamp.
 */
const Body = z.object({
  recording_mode: z.enum(["two_sided", "mic_only", "unavailable"]),
  recording_note: z.string().trim().max(300).nullable().optional(),
  app_version: z.string().trim().max(40).nullable().optional(),
  android_version: z.string().trim().max(40).nullable().optional(),
  manufacturer: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(80).nullable().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/device-capability")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind !== "device") return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
        }
        const body = parsed.data;
        const capable = body.recording_mode !== "unavailable";
        const now = new Date().toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("agent_devices")
          .update({
            recording_mode: body.recording_mode,
            recording_capable: capable,
            recording_tested: true,
            recording_note: body.recording_note ?? null,
            recording_checked_at: now,
            last_seen_at: now,
            ...(body.app_version ? { app_version: body.app_version } : {}),
            ...(body.android_version ? { android_version: body.android_version } : {}),
            ...(body.manufacturer ? { manufacturer: body.manufacturer } : {}),
            ...(body.model ? { model: body.model } : {}),
          })
          .eq("id", caller.device.id);
        if (error) return json({ error: error.message }, 500);

        // Only log a sync event when the verdict actually changed, so the IT
        // timeline shows real capability changes and not every heartbeat.
        if (caller.device.recording_mode !== body.recording_mode) {
          const { recordSyncEvent } = await import("@/lib/call-jobs.server");
          await recordSyncEvent({
            agentId: caller.profile.id,
            deviceId: caller.device.id,
            eventType: "device_capability",
            entityType: "agent_device",
            entityId: caller.device.id,
            payload: {
              recording_mode: body.recording_mode,
              previous_mode: caller.device.recording_mode,
              recording_note: body.recording_note ?? null,
            },
          });
        }

        return json({
          ok: true,
          recording_mode: body.recording_mode,
          recording_capable: capable,
          checked_at: now,
        });
      },
    },
  },
});
