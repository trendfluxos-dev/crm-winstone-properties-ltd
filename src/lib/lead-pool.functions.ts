import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The company lead database, owned by the IT council.
 *
 * Leads that head office has bought or imported wait here unassigned. Once a day
 * IT types how many leads each agent should get; that many leads leave the
 * database, oldest serial first, and land in every active agent's own list for
 * today's work. Whatever is left over simply stays in the database for the next
 * day — nothing is deleted and every hand-over is written to the lead's history.
 */

const TokenInput = z.object({ adminToken: z.string().nullable().optional() });

/** Today in Dhaka — the working day a distributed lead belongs to. */
function dhakaToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function authority(adminToken: string | null | undefined) {
  const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken ?? null);
  requireAuthority(caller);
  return caller;
}

export type LeadPoolAgent = {
  id: string;
  name: string;
  total: number;
  pending: number;
  today: number;
};

/** What is in the database right now, and what each agent already holds. */
export const leadPoolStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await authority(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = dhakaToday();

    const [{ data: pool }, { data: agents }, { data: assigned }] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select("id, name, phone_number, serial_no, reference_by, created_at")
        .is("assigned_to", null)
        .order("serial_no", { ascending: true })
        .limit(5000),
      supabaseAdmin
        .from("profiles")
        .select("id, name")
        .eq("role", "agent")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("name"),
      supabaseAdmin
        .from("leads")
        .select("assigned_to, status, work_date")
        .not("assigned_to", "is", null)
        .limit(20000),
    ]);

    const rows = assigned ?? [];
    const perAgent: LeadPoolAgent[] = (agents ?? []).map((agent) => {
      const mine = rows.filter((row) => row.assigned_to === agent.id);
      return {
        id: agent.id,
        name: agent.name,
        total: mine.length,
        pending: mine.filter((row) => row.status === "pending").length,
        today: mine.filter((row) => row.work_date === today).length,
      };
    });

    return {
      today,
      poolCount: (pool ?? []).length,
      preview: (pool ?? []).slice(0, 12),
      agents: perAgent,
    };
  });

const DistributeInput = z.object({
  adminToken: z.string().nullable().optional(),
  /** How many database leads each active agent should receive today. */
  perAgent: z.number().int().min(1).max(500),
});

/** Hands the same number of database leads to every active agent. */
export const distributeLeadPool = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DistributeInput.parse(input))
  .handler(async ({ data }) => {
    const caller = await authority(data.adminToken);
    const { requireWrite } = await import("@/lib/access.server");
    requireWrite(caller);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = dhakaToday();

    const { data: agents } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .eq("role", "agent")
      .eq("is_active", true)
      .eq("approval_status", "approved")
      .order("name");
    if (!agents || agents.length === 0) throw new Error("চালু কোনো এজেন্ট নেই");

    const need = agents.length * data.perAgent;
    const { data: pool } = await supabaseAdmin
      .from("leads")
      .select("id, name, serial_no, created_at")
      .is("assigned_to", null)
      .order("created_at", { ascending: true })
      .limit(need);

    const available = pool ?? [];
    if (available.length === 0) throw new Error("ডেটাবেজে অ্যাসাইন করার মতো কোনো লিড নেই");

    // Oldest first, one round at a time, so an incomplete batch is still fair.
    const perAgentLeads = new Map<string, { name: string; leadIds: string[] }>();
    available.forEach((lead, index) => {
      const agent = agents[index % agents.length]!;
      const bucket = perAgentLeads.get(agent.id) ?? { name: agent.name, leadIds: [] };
      bucket.leadIds.push(lead.id);
      perAgentLeads.set(agent.id, bucket);
    });

    // Batched writes: one update + one assignment insert + one event insert per
    // chunk, so a big daily hand-out stays a handful of round-trips.
    const CHUNK = 100;
    let moved = 0;
    for (const [agentId, bucket] of perAgentLeads) {
      for (let start = 0; start < bucket.leadIds.length; start += CHUNK) {
        const ids = bucket.leadIds.slice(start, start + CHUNK);
        const { data: updated, error } = await supabaseAdmin
          .from("leads")
          .update({
            assigned_to: agentId,
            assigned_agent_id: agentId,
            assignment_source: "lead_database",
            work_date: today,
          })
          .in("id", ids)
          .is("assigned_to", null)
          .select("id");
        if (error) continue;
        const takenIds = (updated ?? []).map((row) => row.id);
        if (takenIds.length === 0) continue;
        moved += takenIds.length;

        await supabaseAdmin.from("lead_assignments").insert(
          takenIds.map((leadId) => ({
            lead_id: leadId,
            from_agent_id: null,
            to_agent_id: agentId,
            source: "lead_database",
            note: `লিড ডেটাবেজ থেকে ${bucket.name} — ${today}`,
          })),
        );
        await supabaseAdmin.from("lead_events").insert(
          takenIds.map((leadId) => ({
            lead_id: leadId,
            agent_id: agentId,
            kind: "workday_moved" as const,
            detail: `লিড ডেটাবেজ থেকে ${bucket.name}-কে দেওয়া হয়েছে (${today})`,
          })),
        );
      }
    }

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "lead_pool_distributed",
      entityType: "lead_pool",
      entityId: today,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      metadata: { perAgent: data.perAgent, agents: agents.length, moved },
    });

    const { count } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .is("assigned_to", null);

    return { moved, agents: agents.length, remaining: count ?? 0 };
  });
