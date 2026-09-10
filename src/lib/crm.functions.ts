import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AdminToken = z.string().min(1);

/** Everything the board needs, read server-side so agents never need an account. */
export const getCrmSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profiles, leads, calls, messages] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").order("name"),
    supabaseAdmin.from("leads").select("*").order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("call_recordings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("whatsapp_interactions")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1000),
  ]);
  const failed = [profiles, leads, calls, messages].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    profiles: profiles.data ?? [],
    leads: leads.data ?? [],
    calls: calls.data ?? [],
    messages: messages.data ?? [],
  };
});

/** Verifies the master PIN and returns an opaque token the browser keeps locally. */
export const unlockAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ pin: z.string().min(1).max(32) }).parse(input))
  .handler(async ({ data }) => {
    const { pinMatches, mintAdminToken } = await import("@/lib/admin-gate.server");
    if (!pinMatches(data.pin)) return { ok: false as const };
    return { ok: true as const, token: mintAdminToken() };
  });

/** Lets the browser confirm a stored token is still valid (e.g. after a secret rotation). */
export const checkAdminToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { adminTokenValid } = await import("@/lib/admin-gate.server");
    return { valid: adminTokenValid(data.token) };
  });

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

/** Splits every unassigned lead evenly across the active agents. Admin PIN required. */
export const autoDistributeLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: AdminToken }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: agents, error: agentError }, { data: leads, error: leadError }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("is_active", true)
          .in("role", ["agent", "team_leader"])
          .order("name"),
        supabaseAdmin.from("leads").select("id").is("assigned_to", null).order("created_at"),
      ]);

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
  adminToken: AdminToken,
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
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { adminToken: _token, ...payload } = data;
    const { ingestRecording, processRecording } = await import("@/lib/call-intel.server");
    const recordingId = await ingestRecording(payload);
    await processRecording(recordingId);
    return { recordingId };
  });

const ManualMessageInput = z.object({
  adminToken: AdminToken,
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
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
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

const ReanalyzeInput = z.object({ adminToken: AdminToken, recordingId: z.string().uuid() });

/** Re-runs transcription and AI analysis for one recording. Admin PIN required. */
export const reanalyzeRecording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ReanalyzeInput.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { processRecording } = await import("@/lib/call-intel.server");
    await processRecording(data.recordingId);
    return { ok: true };
  });
