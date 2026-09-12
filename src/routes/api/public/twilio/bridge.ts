import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  buildBridgeTwiML,
  twilioConfig,
  twilioFormData,
  validateSignature,
} from "@/lib/twilio.server";

const Query = z.object({
  leadId: z.string().uuid(),
  agentId: z.string().uuid(),
  customerPhone: z.string().min(5),
  record: z.enum(["true", "false"]).default("true"),
});

function twiML(xml: string, status = 200): Response {
  return new Response(xml, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/public/twilio/bridge")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cfg = twilioConfig();
        if (!cfg.webhookBase) return twiML(buildErrorTwiML("Webhook base URL missing"), 500);

        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return twiML(buildErrorTwiML("Invalid bridge parameters"), 400);

        const { leadId, agentId, customerPhone, record } = parsed.data;
        const signature = request.headers.get("X-Twilio-Signature");
        const params = Object.fromEntries(url.searchParams) as Record<string, string>;
        if (!validateSignature(cfg, url.toString(), params, signature)) {
          return twiML(buildErrorTwiML("Invalid signature"), 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Upsert a lifecycle row keyed by the parent CallSid Twilio sends us.
        const form = await twilioFormData(request).catch(() => ({}));
        const callSid = form["CallSid"];
        if (callSid) {
          const { data: existing } = await supabaseAdmin
            .from("call_recordings")
            .select("id")
            .eq("external_call_id", callSid)
            .maybeSingle();
          if (!existing) {
            await supabaseAdmin.from("call_recordings").insert({
              lead_id: leadId,
              agent_id: agentId,
              phone_number: customerPhone,
              call_direction: "outgoing",
              duration_seconds: 0,
              is_two_sided: true,
              sync_status: "uploaded",
              analysis_status: "pending",
              call_source: "twilio",
              call_status: "ringing",
              external_call_id: callSid,
              recording_status: cfg.recordingEnabled && record === "true" ? "pending" : "not_available",
              upload_status: "pending",
            });
          }
        }

        const recordingUrl = `${cfg.webhookBase}/api/public/twilio/recording`;
        return twiML(
          buildBridgeTwiML({
            customerPhone,
            record: record === "true" && cfg.recordingEnabled,
            recordingStatusCallback: recordingUrl,
            consentNotice: cfg.recordingConsentNotice,
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
