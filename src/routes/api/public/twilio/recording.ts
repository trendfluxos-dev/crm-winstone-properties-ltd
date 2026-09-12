import { createFileRoute } from "@tanstack/react-router";

import { twilioConfig, twilioFormData, validateSignature } from "@/lib/twilio.server";

function ok(): Response {
  return new Response("ok", { status: 200 });
}

export const Route = createFileRoute("/api/public/twilio/recording")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cfg = twilioConfig();
        const signature = request.headers.get("X-Twilio-Signature");
        const params = await twilioFormData(request);
        const { claimWebhookEvent, markWebhookProcessed, markWebhookFailed, markWebhookRejected } =
          await import("@/lib/webhook-log.server");

        if (!validateSignature(cfg, request.url, params, signature)) {
          await markWebhookRejected({
            provider: "twilio",
            eventType: "recording",
            reason: "invalid X-Twilio-Signature",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const recordingSid = params["RecordingSid"];
        const callSid = params["CallSid"];
        const recordingUrl = params["RecordingUrl"];
        const status = params["RecordingStatus"] ?? "";
        const duration = Number(params["RecordingDuration"] ?? "0");
        const channels = Number(params["RecordingChannels"] ?? "1");
        if (!recordingSid || !callSid) return ok();

        const claim = await claimWebhookEvent({
          provider: "twilio",
          eventId: `${recordingSid}:${status}`,
          eventType: "recording",
          signatureValid: true,
          payload: params,
        });
        if (!claim.fresh) return ok();

        if (status !== "completed" || !recordingUrl) {
          // Failed or in-progress recordings are noted but not downloaded.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin
            .from("call_recordings")
            .update({ recording_status: status === "failed" ? "failed" : "pending" })
            .eq("external_call_id", callSid);
          if (status === "failed") await markWebhookFailed(claim.id, "Twilio reported recording failed");
          else await markWebhookProcessed(claim.id, `recording status ${status}`);
          return ok();
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("call_recordings")
          .select("id, agent_id, lead_id, duration_seconds, recording_status")
          .eq("external_call_id", callSid)
          .maybeSingle();

        if (!existing) {
          await markWebhookProcessed(claim.id, "no matching call row");
          return ok();
        }

        // Download the recording from Twilio using AccountSid/AuthToken basic auth.
        let bytes: Uint8Array | null = null;
        let mime = "audio/wav";
        let fileName = `${recordingSid}.wav`;
        try {
          const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString("base64");
          const res = await fetch(recordingUrl, {
            headers: { Authorization: `Basic ${auth}` },
          });
          if (!res.ok) throw new Error(`download failed (${res.status})`);
          const contentType = res.headers.get("Content-Type");
          if (contentType) mime = contentType;
          const ext = mime.includes("mp3") ? "mp3" : mime.includes("m4a") ? "m4a" : "wav";
          fileName = `${recordingSid}.${ext}`;
          bytes = new Uint8Array(await res.arrayBuffer());
        } catch (error) {
          console.error("[twilio] recording download failed", error);
          await supabaseAdmin
            .from("call_recordings")
            .update({
              recording_status: "failed",
              analysis_status: "failed",
              stt_error_message: String(error),
            })
            .eq("id", existing.id);
          await markWebhookFailed(claim.id, error);
          return ok();
        }

        const path = `twilio/${existing.agent_id ?? "unassigned"}/${existing.lead_id ?? "no-lead"}/${Date.now()}_${fileName}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from("call-audio")
          .upload(path, bytes, { contentType: mime });

        if (uploadError) {
          console.error("[twilio] storage upload failed", uploadError);
          await supabaseAdmin
            .from("call_recordings")
            .update({ recording_status: "failed", stt_error_message: uploadError.message })
            .eq("id", existing.id);
          await markWebhookFailed(claim.id, uploadError.message);
          return ok();
        }

        await supabaseAdmin
          .from("call_recordings")
          .update({
            audio_url: path,
            storage_bucket: "call-audio",
            storage_path: path,
            file_name: fileName,
            mime_type: mime,
            file_size_bytes: bytes.byteLength,
            duration_seconds: duration > 0 ? duration : existing.duration_seconds,
            is_two_sided: channels >= 2,
            recording_status: "available",
            upload_status: "uploaded",
            sync_status: "uploaded",
            analysis_status: "pending",
          })
          .eq("id", existing.id);

        // Queue transcription + AI analysis via the durable job queue.
        const { queueCallJobs } = await import("@/lib/call-jobs.server");
        await queueCallJobs(existing.id, true);

        // Kick the sweeper so short calls are analysed quickly.
        const { analyzePending } = await import("@/lib/analysis-queue.server");
        void analyzePending(2).catch((err) => console.error("[twilio] analysis sweep failed", err));

        await markWebhookProcessed(claim.id);
        return ok();
      },
    },
  },
});
