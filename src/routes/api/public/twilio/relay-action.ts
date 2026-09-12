/**
 * Action callback for <Connect><ConversationRelay>. Twilio calls this when the
 * AI session ends: either the AI asked for a human handoff, or the session
 * failed. We answer with TwiML that dials the human agent, or says goodbye.
 */

import { createFileRoute } from "@tanstack/react-router";

function twiML(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const Route = createFileRoute("/api/public/twilio/relay-action")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { twilioConfig, validateSignature, twilioFormData, buildInboundTwiML } = await import(
          "@/lib/twilio.server"
        );
        const { claimWebhookEvent, markWebhookProcessed, markWebhookRejected } = await import(
          "@/lib/webhook-log.server"
        );

        const cfg = twilioConfig();
        const params = await twilioFormData(request);
        const signature = request.headers.get("X-Twilio-Signature");
        if (!validateSignature(cfg, request.url, params, signature)) {
          await markWebhookRejected({
            provider: "twilio",
            eventType: "relay-action",
            reason: "invalid X-Twilio-Signature",
          });
          return twiML(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say>Invalid signature</Say></Response>`, 401);
        }

        const callSid = params["CallSid"] ?? "";
        const claim = await claimWebhookEvent({
          provider: "twilio",
          eventId: `${callSid}:relay-action`,
          eventType: "relay-action",
          signatureValid: true,
          payload: params,
        });

        let handoff: { reasonCode?: string; agentPhone?: string | null } = {};
        const raw = params["HandoffData"] ?? params["SessionStatus"] ?? "";
        if (raw.trim().startsWith("{")) {
          try {
            handoff = JSON.parse(raw) as typeof handoff;
          } catch {
            handoff = {};
          }
        }

        if (handoff.agentPhone) {
          const recordingUrl = cfg.webhookBase ? `${cfg.webhookBase}/api/public/twilio/recording` : "";
          await markWebhookProcessed(claim.id, "handoff to agent");
          return twiML(
            buildInboundTwiML({
              agentPhone: handoff.agentPhone,
              record: cfg.recordingEnabled,
              recordingStatusCallback: recordingUrl,
              consentNotice: cfg.recordingConsentNotice,
            }),
          );
        }

        await markWebhookProcessed(claim.id, handoff.reasonCode ?? "session ended");
        return twiML(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say language="bn-IN">${escapeXml("ধন্যবাদ। আপনার এজেন্ট শীঘ্রই ফিরতি কল দেবেন।")}</Say><Hangup/></Response>`);
      },
    },
  },
});
