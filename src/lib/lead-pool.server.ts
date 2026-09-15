/**
 * The head lead database engine.
 *
 * Head office leads wait unassigned in `leads`. Every working day the same
 * number of them goes to each active agent — oldest first — and the rest stay in
 * the database for the following days. Nothing is deleted and every hand-over is
 * written to the lead's own history.
 *
 * Duplicate protection is the core rule here:
 *   - a lead row leaves the database only once (the update is guarded by
 *     `assigned_to IS NULL`), so two agents can never receive the same row;
 *   - a phone number that already sits in somebody's list is never handed out
 *     again — the duplicate row is parked as `duplicate_skipped` so tomorrow's
 *     run does not look at it either;
 *   - duplicates inside the database itself are collapsed the same way.
 */

/** Today in Dhaka — the working day a distributed lead belongs to. */
export function dhakaToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const DUPLICATE = "duplicate_skipped";
/** Rows still usable by the daily hand-out (not parked as duplicates). */
const USABLE = `assignment_source.is.null,assignment_source.neq.${DUPLICATE}`;

/** Digits-only key so 01712..., +88017121... and 8801712... count as one number. */
function phoneKey(raw: string | null | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export type PoolAgent = { id: string; name: string };

export async function activeAgents(): Promise<PoolAgent[]> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name")
    .eq("role", "agent")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .order("name");
  return data ?? [];
}

/** How many leads are still usable in the database. */
export async function usablePoolCount(): Promise<number> {
  const supabaseAdmin = await admin();
  const { count } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .is("assigned_to", null)
    .or(USABLE);
  return count ?? 0;
}

/** Every phone number that already belongs to an agent. */
async function assignedPhoneKeys(): Promise<Set<string>> {
  const supabaseAdmin = await admin();
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("phone_number")
      .not("assigned_to", "is", null)
      .range(from, from + 999);
    (data ?? []).forEach((row) => keys.add(phoneKey(row.phone_number)));
    if (!data || data.length < 1000) break;
  }
  return keys;
}

export type DistributionResult = {
  moved: number;
  agents: number;
  perAgent: number;
  duplicatesSkipped: number;
  remaining: number;
  /** True when the database cannot cover another full round tomorrow. */
  shortage: boolean;
  /** How many more leads head office needs for one more full round. */
  shortfall: number;
  workDate: string;
};

/**
 * Hands `perAgent` database leads to every active agent for today.
 * Safe to call twice — a lead already taken is never taken again.
 */
export async function distributeDailyLeads(options: {
  perAgent: number;
  actorProfileId?: string | null;
  actorLabel?: string;
  trigger: "manual" | "daily_auto";
}): Promise<DistributionResult> {
  const supabaseAdmin = await admin();
  const today = dhakaToday();
  const agents = await activeAgents();
  if (agents.length === 0) throw new Error("চালু কোনো এজেন্ট নেই");

  const need = agents.length * options.perAgent;
  // Read more than needed so phone duplicates can be skipped without shrinking
  // today's hand-out.
  const { data: pool } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone_number, created_at")
    .is("assigned_to", null)
    .or(USABLE)
    .order("created_at", { ascending: true })
    .limit(Math.min(need * 3 + 200, 6000));

  const taken = await assignedPhoneKeys();
  const seen = new Set<string>();
  const usable: { id: string }[] = [];
  const duplicates: string[] = [];

  for (const lead of pool ?? []) {
    const key = phoneKey(lead.phone_number);
    if (!key) {
      duplicates.push(lead.id);
      continue;
    }
    if (taken.has(key) || seen.has(key)) {
      duplicates.push(lead.id);
      continue;
    }
    seen.add(key);
    if (usable.length < need) usable.push({ id: lead.id });
  }

  // Park duplicates so they never come up again, and so the database count is honest.
  for (let start = 0; start < duplicates.length; start += 200) {
    await supabaseAdmin
      .from("leads")
      .update({ assignment_source: DUPLICATE })
      .in("id", duplicates.slice(start, start + 200))
      .is("assigned_to", null);
  }

  if (usable.length === 0 && duplicates.length === 0) {
    throw new Error("ডেটাবেজে অ্যাসাইন করার মতো কোনো নতুন লিড নেই");
  }

  // Round-robin, oldest first, so an incomplete batch is still fair.
  const buckets = new Map<string, { name: string; leadIds: string[] }>();
  usable.forEach((lead, index) => {
    const agent = agents[index % agents.length]!;
    const bucket = buckets.get(agent.id) ?? { name: agent.name, leadIds: [] };
    bucket.leadIds.push(lead.id);
    buckets.set(agent.id, bucket);
  });

  const CHUNK = 100;
  let moved = 0;
  for (const [agentId, bucket] of buckets) {
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
          note: `হেড ডেটাবেজ থেকে ${bucket.name} — ${today}`,
        })),
      );
      await supabaseAdmin.from("lead_events").insert(
        takenIds.map((leadId) => ({
          lead_id: leadId,
          agent_id: agentId,
          kind: "workday_moved" as const,
          detail: `হেড ডেটাবেজ থেকে ${bucket.name}-কে দেওয়া হয়েছে (${today})`,
        })),
      );
    }
  }

  const remaining = await usablePoolCount();
  const shortfall = Math.max(0, need - remaining);
  const shortage = remaining < need;

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "lead_pool_distributed",
    entityType: "lead_pool",
    entityId: today,
    actorProfileId: options.actorProfileId ?? null,
    actorLabel: options.actorLabel ?? "IT Console",
    metadata: {
      perAgent: options.perAgent,
      agents: agents.length,
      moved,
      duplicatesSkipped: duplicates.length,
      remaining,
      trigger: options.trigger,
    },
  });

  if (shortage) await raiseShortageAlert({ remaining, need, perAgent: options.perAgent });

  return {
    moved,
    agents: agents.length,
    perAgent: options.perAgent,
    duplicatesSkipped: duplicates.length,
    remaining,
    shortage,
    shortfall,
    workDate: today,
  };
}

/**
 * One alert per day for Executive HQ and the IT Console when the database can no
 * longer cover a full round tomorrow.
 */
export async function raiseShortageAlert(input: {
  remaining: number;
  need: number;
  perAgent: number;
}) {
  const supabaseAdmin = await admin();
  const today = dhakaToday();
  const { data: existing } = await supabaseAdmin
    .from("system_alerts")
    .select("id")
    .eq("code", "lead_pool_low")
    .gte("created_at", `${today}T00:00:00Z`)
    .is("acknowledged_at", null)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabaseAdmin.from("system_alerts").insert({
    code: "lead_pool_low",
    severity: "warning",
    title: `হেড ডেটাবেজে লিড কমে এসেছে — বাকি ${input.remaining}টি`,
    detail: `আগামীকাল প্রত্যেক এজেন্টকে ${input.perAgent}টি করে দিতে ${input.need}টি লিড দরকার, ডেটাবেজে আছে ${input.remaining}টি।`,
    action: "হেড অফিস থেকে নতুন লিড আপলোড করুন (IT Console → লিড ডেটাবেজ)",
  });
}

/** How many leads each agent gets on the automatic daily run. */
export async function dailyPlan(): Promise<{ perAgent: number; lastRunDate: string | null }> {
  const supabaseAdmin = await admin();
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("data")
    .eq("id", "lead_pool_daily")
    .maybeSingle();
  const state = (data?.data ?? {}) as { perAgent?: number; lastRunDate?: string };
  return { perAgent: state.perAgent ?? 30, lastRunDate: state.lastRunDate ?? null };
}

export async function saveDailyPlan(input: { perAgent: number; lastRunDate?: string | null }) {
  const supabaseAdmin = await admin();
  const current = await dailyPlan();
  await supabaseAdmin.from("app_config").upsert({
    id: "lead_pool_daily",
    data: {
      perAgent: input.perAgent,
      lastRunDate: input.lastRunDate ?? current.lastRunDate,
    },
    updated_at: new Date().toISOString(),
  });
}
