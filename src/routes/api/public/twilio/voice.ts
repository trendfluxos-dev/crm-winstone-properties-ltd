import { createFileRoute } from "@tanstack/react-router";

import { buildInboundTwiML, normalizePhone, twilioConfig, validateSignature } from "@/lib/twilio.server";

function twiML(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/twilio/voice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = twilioConfig();
        const signature = request.headers.get("X-Twilio-Signature");
        const form = await request.formData();
        const params: Record<string, string> = {};
        for (const [key, value] of form.entries()) {
          if (typeof value === "string") params[key] = value;
        }

        if (!validateSignature(cfg, request.url, params, signature)) {
          return twiML(buildErrorTwiML("Invalid signature"), 401);
        }

        const caller = params["From"];
        const called = params["To"];
        const callSid = params["CallSid"];
        if (!caller || !callSid) return twiML(buildErrorTwiML("Missing caller"), 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const normalized = normalizePhone(caller);

        // Look for a lead with this phone number; prefer one assigned to an agent.
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, assigned_to, assigned_agent_id, phone_number")
          .or(`phone_number.eq.${normalized},phone_number.ilike.%${normalized.slice(-10)}`)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Pick the assigned agent's phone, or any active agent if unassigned.
        let agentPhone: string | null = null;
        let agentId: string | null = null;
        if (lead?.assigned_to) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, phone")
            .eq("id", lead.assigned_to)
            .maybeSingle();
          if (profile?.phone) {
            agentPhone = normalizePhone(profile.phone);
            agentId = profile.id;
          }
        }
        if (!agentPhone) {
          const { data: fallback } = await supabaseAdmin
            .from("profiles")
            .select("id, phone")
            .eq("is_active", true)
            .in("role", ["agent", "team_leader"])
            .not("phone", "is", null)
            .order("last_active_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (fallback?.phone) {
            agentPhone = normalizePhone(fallback.phone);
            agentId = fallback.id;
          }
        }

        // Record the inbound attempt; use callSid as the external id.
        const { data: existing } = await supabaseAdmin
          .from("call_recordings")
          .select("id")
          .eq("external_call_id", callSid)
          .maybeSingle();
        if (!existing) {
          await supabaseAdmin.from("call_recordings").insert({
            lead_id: lead?.id ?? null,
            agent_id: agentId ?? lead?.assigned_agent_id ?? null,
            phone_number: normalized,
            call_direction: "incoming_callback",
            duration_seconds: 0,
            is_two_sided: true,
            sync_status: "uploaded",
            analysis_status: "pending",
            call_source: "twilio",
            call_status: "ringing",
            external_call_id: callSid,
            agent_phone: called ?? null,
            started_at: new Date().toISOString(),
            recording_status: cfg.recordingEnabled ? "pending" : "not_available",
            upload_status: "pending",
          });
        }

        const recordingUrl = cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/recording` : "";
        return twiML(
          buildInboundTwiML({
            agentPhone: agentPhone ?? undefined,
            record: cfg.recordingEnabled,
            recordingStatusCallback: recordingUrl,
            consentNotice: cfg.recordingConsentNotice,
            fallbackMessage:
              "ধন্যবাদ, কিন্তু এখন কোনো এজেন্ট যুক্ত নেই। অনুগ্রহ করে পরে আবার চেষ্টা করুন।",
          }),
        );
      },
    },
  },
});

function buildErrorTwiML(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">${message}</Say></Response>`;
}
