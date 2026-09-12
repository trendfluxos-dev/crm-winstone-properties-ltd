import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InitiateSchema = z.object({ leadId: z.string().uuid() });

/**
 * Starts a bridged Twilio call from the CRM.
 * The agent's profile phone rings first; when answered Twilio dials the lead
 * and records the conversation (when recording consent is enabled).
 */
export const initiateTwilioCall = createServerFn({ method: "POST" })
  .middleware([(await import("@/integrations/supabase/auth-middleware")).requireSupabaseAuth])
  .inputValidator((input: unknown) => InitiateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { twilioConfig, isConfigured, createOutboundCall, normalizePhone } = await import(
      "@/lib/twilio.server"
    );

    if (!isConfigured()) throw new Error("Twilio is not configured");

    const cfg = twilioConfig();
    const [profile, lead] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", context.userId).single(),
      supabaseAdmin.from("leads").select("*").eq("id", data.leadId).single(),
    ]);
    if (profile.error || !profile.data) throw new Error("Agent profile not found");
    if (lead.error || !lead.data) throw new Error("Lead not found");

    // Agents can only call leads assigned to them.
    if (profile.data.role === "agent" && lead.data.assigned_to !== profile.data.id) {
      throw new Error("This lead is not assigned to you");
    }
    if (!profile.data.phone) throw new Error("Agent phone number is not set");

    const result = await createOutboundCall({
      agentPhone: normalizePhone(profile.data.phone),
      customerPhone: normalizePhone(lead.data.phone_number),
      leadId: lead.data.id,
      agentId: profile.data.id,
      record: cfg.recordingEnabled,
    });

    // Record the lifecycle row immediately so the desk can show "ringing".
    const { data: inserted } = await supabaseAdmin
      .from("call_recordings")
      .insert({
        lead_id: lead.data.id,
        agent_id: profile.data.id,
        phone_number: lead.data.phone_number,
        call_direction: "outgoing",
        duration_seconds: 0,
        is_two_sided: true,
        sync_status: "uploaded",
        analysis_status: "pending",
        call_source: "twilio",
        call_status: "initiated",
        external_call_id: result.callSid,
        agent_phone: profile.data.phone,
        started_at: new Date().toISOString(),
        recording_status: cfg.recordingEnabled ? "pending" : "not_available",
        upload_status: "pending",
      })
      .select("id")
      .single();

    return {
      callSid: result.callSid,
      status: result.status,
      recordingId: inserted?.id ?? null,
    };
  });

const HealthTokenSchema = z.object({ adminToken: z.string().nullable().optional() });

/** Health/status summary shown only to IT/HQ. */
export const twilioHealth = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HealthTokenSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);

    const { twilioConfig, isConfigured, resolvePhoneNumber } = await import("@/lib/twilio.server");
    const cfg = twilioConfig();
    const phone = cfg.phoneNumber ?? (await resolvePhoneNumber().catch(() => null));

    return {
      configured: isConfigured(cfg),
      hasApiKey: !!cfg.apiKey,
      hasAccountSid: !!cfg.accountSid,
      hasAuthToken: !!cfg.authToken,
      hasPhoneNumber: !!phone,
      phoneNumber: phone,
      webhookBase: cfg.webhookBase,
      recordingEnabled: cfg.recordingEnabled,
      consentNotice: cfg.recordingConsentNotice,
      voiceUrl: cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/voice` : null,
      statusUrl: cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/call-status` : null,
      recordingUrl: cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/recording` : null,
      whatsappUrl: cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/whatsapp` : null,
    };
  });
