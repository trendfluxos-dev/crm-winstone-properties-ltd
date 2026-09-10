import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AudioInput = z.object({ path: z.string().min(1) });

/** Short-lived playback link for a stored call recording. */
export const getAudioUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AudioInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("call-audio")
      .createSignedUrl(data.path, 60 * 60);
    if (error || !signed) throw new Error(error?.message ?? "Could not create playback link");
    return { url: signed.signedUrl };
  });

/** Splits every unassigned lead evenly across the active agents. */
export const autoDistributeLeads = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: agents, error: agentError }, { data: leads, error: leadError }] = await Promise.all(
    [
      supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .in("role", ["agent", "team_leader"])
        .order("name"),
      supabaseAdmin.from("leads").select("id").is("assigned_to", null).order("created_at"),
    ],
  );

  if (agentError) throw new Error(agentError.message);
  if (leadError) throw new Error(leadError.message);
  if (!agents?.length) throw new Error("No active agents to distribute to");
  if (!leads?.length) return { assigned: 0, agents: agents.length };

  await Promise.all(
    leads.map((lead, index) =>
      supabaseAdmin
        .from("leads")
        .update({ assigned_to: agents[index % agents.length]!.id })
        .eq("id", lead.id),
    ),
  );

  return { assigned: leads.length, agents: agents.length };
});

const ManualCallInput = z.object({
  leadId: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  audioBase64: z.string().min(1),
  fileExtension: z.string().min(1).max(5),
  durationSeconds: z.number().int().min(0),
  direction: z.enum(["outgoing", "incoming_callback"]),
  isTwoSided: z.boolean(),
});

/** Admin override: upload a recording by hand and run the AI analysis on it. */
export const uploadCallRecording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ManualCallInput.parse(input))
  .handler(async ({ data }) => {
    const { ingestRecording, processRecording } = await import("@/lib/call-intel.server");
    const recordingId = await ingestRecording(data);
    await processRecording(recordingId);
    return { recordingId };
  });

const ManualMessageInput = z.object({
  leadId: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
  senderType: z.enum(["agent", "customer"]),
  messageType: z.enum(["text", "voice_note", "image", "document"]),
  messageContent: z.string().min(1),
});

/** Admin override: log a WhatsApp message against a lead. */
export const logWhatsappMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ManualMessageInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("whatsapp_interactions").insert({
      lead_id: data.leadId,
      agent_id: data.agentId,
      sender_type: data.senderType,
      message_type: data.messageType,
      message_content: data.messageContent,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ReanalyzeInput = z.object({ recordingId: z.string().uuid() });

/** Re-runs transcription and AI analysis for one recording. */
export const reanalyzeRecording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReanalyzeInput.parse(input))
  .handler(async ({ data }) => {
    const { processRecording } = await import("@/lib/call-intel.server");
    await processRecording(data.recordingId);
    return { ok: true };
  });
