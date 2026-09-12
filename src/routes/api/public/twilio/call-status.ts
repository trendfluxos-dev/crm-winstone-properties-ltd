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
          return new Response("Invalid signature", { status: 401 });
        }

        const callSid = params["CallSid"];
        const status = params["CallStatus"];
        const duration = Number(params["CallDuration"] ?? "0");
        if (!callSid) return ok();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("call_recordings")
          .select("id, call_status, recording_status")
          .eq("external_call_id", callSid)
          .maybeSingle();

        const now = new Date().toISOString();
        const patch: Record<string, unknown> = {};

        // Map Twilio statuses onto our simpler CRM lifecycle.
        if (["initiated", "ringing"].includes(status)) patch["call_status"] = "ringing";
        else if (status === "answered" || status === "in-progress") patch["call_status"] = "answered";
        else if (status === "completed") patch["call_status"] = "completed";
        else if (["failed", "busy", "no-answer", "canceled"].includes(status)) {
          patch["call_status"] = status === "no-answer" ? "no_answer" : "failed";
        }

        if (status === "answered" || status === "in-progress") patch["answered_at"] = now;
        if (["completed", "failed", "busy", "no-answer", "canceled"].includes(status)) {
          patch["finished_at"] = now;
        }
        if (duration > 0) patch["duration_seconds"] = duration;

        if (existing) {
          await supabaseAdmin.from("call_recordings").update(patch).eq("id", existing.id);
        }

        // If the call ended without a recording callback, make sure the report flow can proceed.
        if (status === "completed" && existing?.recording_status === "pending") {
          await supabaseAdmin
            .from("call_recordings")
            .update({ recording_status: "not_available" })
            .eq("id", existing.id);
        }

        return ok();
      },
    },
  },
});
