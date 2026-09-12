import { createFileRoute } from "@tanstack/react-router";

import { twilioConfig, twilioFormData, validateSignature } from "@/lib/twilio.server";

function ok(): Response {
  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/twilio/call-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = twilioConfig();
        const signature = request.headers.get("X-Twilio-Signature");
        const params = await twilioFormData(request);
        if (!validateSignature(cfg, request.url, params, signature)) {
          const { markWebhookRejected } = await import("@/lib/webhook-log.server");
          await markWebhookRejected({
            provider: "twilio",
            eventType: "call-status",
            reason: "invalid X-Twilio-Signature",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const callSid = params["CallSid"];
        const status = params["CallStatus"] ?? "";
        const duration = Number(params["CallDuration"] ?? "0");
        if (!callSid) return ok();

        const { claimWebhookEvent, markWebhookProcessed, markWebhookFailed } = await import(
          "@/lib/webhook-log.server"
        );
        const claim = await claimWebhookEvent({
          provider: "twilio",
          eventId: `${callSid}:${status}`,
          eventType: "call-status",
          signatureValid: true,
          payload: params,
        });
        if (!claim.fresh) return ok();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("call_recordings")
          .select("id, recording_status")
          .eq("external_call_id", callSid)
          .maybeSingle();

        const now = new Date().toISOString();

        let callStatus: string;
        if (["initiated", "ringing"].includes(status)) callStatus = "ringing";
        else if (status === "answered" || status === "in-progress") callStatus = "answered";
        else if (status === "completed") callStatus = "completed";
        else if (["failed", "busy", "canceled"].includes(status)) callStatus = "failed";
        else if (status === "no-answer") callStatus = "no_answer";
        else callStatus = status;

        const patch: {
          call_status: string;
          answered_at?: string;
          finished_at?: string;
          duration_seconds?: number;
          recording_status?: string;
        } = { call_status: callStatus };

        if (status === "answered" || status === "in-progress") patch.answered_at = now;
        if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
          patch.finished_at = now;
        }
        if (duration > 0) patch.duration_seconds = duration;

        try {
          if (existing) {
            // Calls that finish without a recording callback should not block reports.
            if (status === "completed" && existing.recording_status === "pending") {
              patch.recording_status = "not_available";
            }
            const { error } = await supabaseAdmin
              .from("call_recordings")
              .update(patch)
              .eq("id", existing.id);
            if (error) throw new Error(error.message);
          }
          await markWebhookProcessed(claim.id, existing ? undefined : "no matching call row");
        } catch (error) {
          console.error("[twilio] call-status update failed", error);
          await markWebhookFailed(claim.id, error);
        }

        return ok();
      },
    },
  },
});
