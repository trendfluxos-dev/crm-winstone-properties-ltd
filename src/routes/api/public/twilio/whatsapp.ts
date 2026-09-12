import { createFileRoute } from "@tanstack/react-router";

import { twilioConfig, twilioFormData, validateSignature } from "@/lib/twilio.server";

function ok(): Response {
  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/twilio/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = twilioConfig();
        const signature = request.headers.get("X-Twilio-Signature");
        const params = await twilioFormData(request);
        const { claimWebhookEvent, markWebhookProcessed, markWebhookRejected } = await import(
          "@/lib/webhook-log.server"
        );

        if (!validateSignature(cfg, request.url, params, signature)) {
          await markWebhookRejected({
            provider: "twilio",
            eventType: "whatsapp",
            reason: "invalid X-Twilio-Signature",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const messageSid = params["MessageSid"];
        const from = params["From"] ?? "";
        const to = params["To"] ?? "";
        const body = params["Body"] ?? "";
        const status = params["MessageStatus"] ?? "";
        const error = params["ErrorCode"] ?? null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");

        // WhatsApp numbers from Twilio are formatted "whatsapp:+1...".
        const normalized = normalizeWhatsAppNumber(from.replace(/^whatsapp:/, ""));
        const now = new Date().toISOString();

        // Find a lead whose phone ends with this number.
        let leadId: string | null = null;
        let agentId: string | null = null;
        if (normalized) {
          const tail = normalized.slice(-9);
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id, assigned_to")
            .ilike("phone_number", `%${tail}`)
            .limit(1)
            .maybeSingle();
          leadId = lead?.id ?? null;
          agentId = lead?.assigned_to ?? null;
        }

        const claim = await claimWebhookEvent({
          provider: "twilio",
          eventId: messageSid ? `${messageSid}:${status || "inbound"}` : `${from}:${now}`,
          eventType: "whatsapp",
          signatureValid: true,
          payload: params,
        });
        if (!claim.fresh) return ok();

        // Honour opt-out keywords immediately (Bengali + English).
        const optOut = /^\s*(stop|unsubscribe|বন্ধ|বন্ধ করুন|আর পাঠাবেন না)\s*$/i.test(body);
        if (optOut && normalized) {
          const { addDoNotContact, saveConsent } = await import("@/lib/comms-guard.server");
          await addDoNotContact({
            phoneNumber: normalized,
            channel: "whatsapp",
            reason: "গ্রাহক নিজে বন্ধ করতে বলেছেন",
            source: "opt_out_keyword",
          });
          await saveConsent({
            leadId,
            phoneNumber: normalized,
            channel: "whatsapp",
            consentType: "marketing",
            granted: false,
            source: "opt_out_keyword",
            note: body.slice(0, 200),
          });
        }

        if (messageSid && status) {
          // Status callback for an outbound message.
          const rank: Record<string, number> = {
            queued: 0,
            accepted: 1,
            sent: 2,
            delivered: 3,
            read: 4,
            failed: -1,
          };
          const mapped = status === "undelivered" ? "failed" : status;
          const { data: existing } = await supabaseAdmin
            .from("whatsapp_interactions")
            .select("id, status")
            .eq("provider_message_id", messageSid)
            .maybeSingle();
          if (existing) {
            const currentRank = rank[existing.status] ?? -2;
            const newRank = rank[mapped] ?? -2;
            if (newRank >= currentRank) {
              await supabaseAdmin
                .from("whatsapp_interactions")
                .update({
                  status: mapped,
                  status_updated_at: now,
                  ...(mapped === "delivered" ? { delivered_at: now } : {}),
                  ...(mapped === "read" ? { delivered_at: now, read_at: now } : {}),
                  ...(mapped === "failed" ? { error_detail: error ?? "Twilio delivery failed" } : {}),
                })
                .eq("id", existing.id);
            }
          }
          await markWebhookProcessed(claim.id, `status ${mapped}`);
          return ok();
        }

        if (!from) {
          await markWebhookProcessed(claim.id, "missing sender");
          return ok();
        }

        // Inbound message.
        const direction = from.startsWith("whatsapp:") ? "in" : "out";
        const senderType = direction === "in" ? "customer" : "agent";
        const senderPhone = direction === "in" ? from.replace(/^whatsapp:/, "") : to.replace(/^whatsapp:/, "");

        // Deduplicate by MessageSid (or body+from+date fallback for sandbox).
        const { data: duplicate } = await supabaseAdmin
          .from("whatsapp_interactions")
          .select("id")
          .eq("provider_message_id", messageSid ?? `${from}:${body}:${now}`)
          .maybeSingle();
        if (!duplicate) {
          await supabaseAdmin.from("whatsapp_interactions").insert({
            lead_id: leadId,
            agent_id: agentId,
            sender_type: senderType,
            message_type: "text",
            message_content: body,
            provider: "twilio",
            provider_message_id: messageSid ?? null,
            status: "delivered",
            status_updated_at: now,
            delivered_at: now,
          });
        }

        await markWebhookProcessed(claim.id, optOut ? "opt-out recorded" : undefined);
        return ok();
      },
    },
  },
});
