import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AdminToken = z.string().min(1);
/** PIN token is optional now: coordinators/agents authenticate with their account. */
const OptionalToken = z.string().nullable().optional();

const SnapshotScope = z.object({
  token: z.string().nullable().optional(),
});

/**
 * Board data scoped to who is asking.
 * Authority (HQ / IT PIN) and coordinators get the whole floor; a signed-in
 * agent gets only their own leads, calls and messages. Anyone else gets nothing.
 */
export const getCrmSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SnapshotScope.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.token ?? null);

    if (caller.scope === "none") return { profiles: [], leads: [], calls: [], messages: [] };

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

    if (caller.scope === "agent" && caller.profile) {
      const me = caller.profile.id;
      const myLeads = (leads.data ?? []).filter((l) => l.assigned_to === me);
      const myLeadIds = new Set(myLeads.map((l) => l.id));
      return {
        profiles: (profiles.data ?? []).filter((p) => p.id === me),
        leads: myLeads,
        calls: (calls.data ?? []).filter((c) => c.agent_id === me || (c.lead_id && myLeadIds.has(c.lead_id))),
        messages: (messages.data ?? []).filter(
          (m) => m.agent_id === me || (m.lead_id && myLeadIds.has(m.lead_id)),
        ),
      };
    }

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

const AudioInput = z.object({
  adminToken: OptionalToken,
  recordingId: z.string().uuid(),
});

/** Short-lived playback link for a stored call recording. */
export const getAudioUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AudioInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("Sign in or enter the master PIN first");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: recording, error: lookupError } = await supabaseAdmin
      .from("call_recordings")
      .select("audio_url, agent_id")
      .eq("id", data.recordingId)
      .maybeSingle();
    if (lookupError) throw new Error("Could not load this recording");
    if (!recording?.audio_url) throw new Error("This recording has no audio");
    if (caller.scope === "agent" && recording.agent_id !== caller.profile?.id) {
      throw new Error("This recording belongs to another agent");
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from("call-audio")
      .createSignedUrl(recording.audio_url, 5 * 60);
    if (error || !signed) throw new Error("Could not create playback link");
    return { url: signed.signedUrl };
  });

/** Splits every unassigned lead evenly across the active agents. Coordinator or PIN. */
export const autoDistributeLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: OptionalToken }).parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
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

const ImportRow = z.object({
  name: z.string().trim().min(1).max(120),
  phone_number: z.string().trim().min(6).max(24),
  company: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Bulk-inserts leads from a CSV (parsed in the browser). Skips numbers already in the pipeline. */
export const importLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: OptionalToken,
        rows: z.array(ImportRow).min(1).max(5000),
        autoAssign: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const normalize = (p: string) => p.replace(/[^\d+]/g, "");
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("leads")
      .select("phone_number");
    if (existingError) throw new Error(existingError.message);
    const seen = new Set((existing ?? []).map((l) => normalize(l.phone_number)));

    let agents: { id: string }[] = [];
    if (data.autoAssign) {
      const { data: activeAgents, error } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .in("role", ["agent", "team_leader"])
        .order("name");
      if (error) throw new Error(error.message);
      agents = activeAgents ?? [];
    }

    const toInsert: {
      name: string;
      phone_number: string;
      company: string | null;
      notes: string | null;
      source: string;
      assigned_to: string | null;
    }[] = [];
    let skipped = 0;
    for (const row of data.rows) {
      const key = normalize(row.phone_number);
      if (!key || seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      toInsert.push({
        name: row.name,
        phone_number: row.phone_number.trim(),
        company: row.company || null,
        notes: row.notes || null,
        source: "csv_import",
        assigned_to: agents.length ? agents[toInsert.length % agents.length]!.id : null,
      });
    }

    if (toInsert.length) {
      const { error } = await supabaseAdmin.from("leads").insert(toInsert);
      if (error) throw new Error(error.message);
    }
    return { imported: toInsert.length, skipped };
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

/** Manual log: upload a recording by hand and run the AI analysis on it. */
export const uploadCallRecording = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ManualCallInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
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

/** Manual log: record a WhatsApp message against a lead. */
export const logWhatsappMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ManualMessageInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
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

const AssignInput = z.object({
  adminToken: OptionalToken,
  agentId: z.string().uuid(),
  count: z.number().int().min(1).max(2000),
  onlyUnassigned: z.boolean().default(true),
});

/** Coordinator dispatcher: push a batch of pending leads under one agent. */
export const assignLeadsToAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AssignInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("leads")
      .select("id")
      .eq("status", "pending")
      .order("created_at")
      .limit(data.count);
    if (data.onlyUnassigned) query = query.is("assigned_to", null);
    else query = query.neq("assigned_to", data.agentId);

    const { data: pool, error } = await query;
    if (error) throw new Error(error.message);
    if (!pool?.length) return { assigned: 0 };

    const { error: updateError } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: data.agentId })
      .in(
        "id",
        pool.map((l) => l.id),
      );
    if (updateError) throw new Error(updateError.message);
    return { assigned: pool.length };
  });
