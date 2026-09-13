/** IT Console / HQ controls for the live AI voice assistant. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveCaller } from "@/lib/access.server";

const Base = z.object({ adminToken: z.string().nullable().optional() });

async function requireAuthority(adminToken: string | null, write = false) {
  const caller = await resolveCaller(adminToken);
  if (caller.scope !== "authority") throw new Error("শুধুমাত্র IT Console/HQ এই কাজ করতে পারবেন");
  if (write) {
    const { requireWrite } = await import("@/lib/access.server");
    requireWrite(caller);
  }
  return caller;
}

export const aiVoiceStatus = createServerFn({ method: "POST" })
  .inputValidator((data: object) => Base.parse(data))
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { relaySettings } = await import("@/lib/relay.server");
    const { twilioConfig } = await import("@/lib/twilio.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cfg = twilioConfig();
    const settings = await relaySettings();
    const wsUrl = cfg.webhookBase
      ? `${cfg.webhookBase.replace(/^http/, "ws")}/api/public/twilio/relay`
      : null;

    const { data: sessions } = await supabaseAdmin
      .from("ai_voice_sessions")
      .select("id, call_sid, from_number, status, turn_count, handoff_reason, error_message, started_at, ended_at")
      .order("started_at", { ascending: false })
      .limit(20);

    return {
      settings,
      websocketUrl: wsUrl,
      actionUrl: cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/relay-action` : null,
      aiKeyPresent: Boolean(process.env["LOVABLE_API_KEY"]),
      sessions: sessions ?? [],
    };
  });

export const updateAiVoice = createServerFn({ method: "POST" })
  .inputValidator((data: object) =>
    Base.extend({
      enabled: z.boolean().optional(),
      greeting: z.string().trim().min(4).max(400).optional(),
      language: z.string().trim().min(2).max(10).optional(),
      ttsLanguage: z.string().trim().min(2).max(10).optional(),
      handoffEnabled: z.boolean().optional(),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const caller = await requireAuthority(data.adminToken ?? null, true);
    const { saveRelaySettings } = await import("@/lib/relay.server");
    const { adminToken: _token, ...patch } = data;
    const saved = await saveRelaySettings(patch);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "ai_voice_settings_updated",
      entityType: "system_settings",
      entityId: "ai_voice",
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: { ...patch },
    });

    return saved;
  });

export const aiVoiceTranscript = createServerFn({ method: "POST" })
  .inputValidator((data: object) => Base.extend({ sessionRowId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    await requireAuthority(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: turns } = await supabaseAdmin
      .from("ai_voice_turns")
      .select("id, turn_index, role, content, interrupted, created_at")
      .eq("session_row_id", data.sessionRowId)
      .order("turn_index", { ascending: true });
    return turns ?? [];
  });
