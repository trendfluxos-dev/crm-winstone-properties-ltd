import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maskForCaller } from "@/lib/pii";

/**
 * The head lead database, reachable from both the IT Console and the Coordinator
 * Deck. The real work (duplicate protection, batched hand-out, shortage alert)
 * lives in lead-pool.server.ts.
 */

const TokenInput = z.object({ adminToken: z.string().nullable().optional() });

async function dispatcher(adminToken: string | null | undefined) {
  const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken ?? null);
  requireDispatch(caller);
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
    const caller = await dispatcher(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dhakaToday, usablePoolCount, activeAgents, dailyPlan } =
      await import("@/lib/lead-pool.server");
    const today = dhakaToday();

    const [poolCount, agents, plan, { data: preview }, { data: assigned }] = await Promise.all([
      usablePoolCount(),
      activeAgents(),
      dailyPlan(),
      supabaseAdmin
        .from("leads")
        .select("id, name, phone_number, serial_no, reference_by, created_at")
        .is("assigned_to", null)
        .or("assignment_source.is.null,assignment_source.neq.duplicate_skipped")
        .order("created_at", { ascending: true })
        .limit(12),
      supabaseAdmin
        .from("leads")
        .select("assigned_to, status, work_date")
        .not("assigned_to", "is", null)
        .limit(20000),
    ]);

    const rows = assigned ?? [];
    const perAgent: LeadPoolAgent[] = agents.map((agent) => {
      const mine = rows.filter((row) => row.assigned_to === agent.id);
      return {
        id: agent.id,
        name: agent.name,
        total: mine.length,
        pending: mine.filter((row) => row.status === "pending").length,
        today: mine.filter((row) => row.work_date === today).length,
      };
    });

    const need = agents.length * plan.perAgent;
    return {
      today,
      poolCount,
      preview: (preview ?? []).map((row) => ({
        ...row,
        // Unassigned pool rows belong to nobody yet, so a moderator sees them masked.
        phone_number:
          maskForCaller(
            {
              maskPii: caller.maskPii,
              leadModerator: caller.leadModerator,
              selfId: caller.profile?.id ?? null,
            },
            null,
            row.phone_number,
          ) ?? "",
      })),
      agents: perAgent,
      dailyPerAgent: plan.perAgent,
      lastRunDate: plan.lastRunDate,
      shortage: poolCount < need,
      daysLeft: need > 0 ? Math.floor(poolCount / need) : 0,
    };
  });

const DistributeInput = z.object({
  adminToken: z.string().nullable().optional(),
  /** How many database leads each active agent should receive today. */
  perAgent: z.number().int().min(1).max(500),
  /** Also make this the amount the automatic daily run uses. */
  saveAsDaily: z.boolean().optional(),
});

/** Hands the same number of database leads to every active agent. */
export const distributeLeadPool = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DistributeInput.parse(input))
  .handler(async ({ data }) => {
    const caller = await dispatcher(data.adminToken);
    const { requireWrite } = await import("@/lib/access.server");
    requireWrite(caller);

    const { distributeDailyLeads, saveDailyPlan, dhakaToday } =
      await import("@/lib/lead-pool.server");
    const result = await distributeDailyLeads({
      perAgent: data.perAgent,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "IT Console",
      trigger: "manual",
    });
    if (data.saveAsDaily) await saveDailyPlan({ perAgent: data.perAgent });
    await saveDailyPlan({ perAgent: data.perAgent, lastRunDate: dhakaToday() });
    return result;
  });

/** Changes only the daily automatic amount, without handing leads out now. */
export const setDailyLeadPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    TokenInput.extend({ perAgent: z.number().int().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await dispatcher(data.adminToken);
    const { requireWrite } = await import("@/lib/access.server");
    requireWrite(caller);
    const { saveDailyPlan } = await import("@/lib/lead-pool.server");
    await saveDailyPlan({ perAgent: data.perAgent });
    return { perAgent: data.perAgent };
  });

export type LeadPoolTally = { label: string; count: number };

/**
 * Head-office view of what the waiting lead database actually contains:
 * totals by quality, sector and area. Counts only — no customer contact
 * details leave the server here, so masking rules stay untouched.
 */
export const leadPoolBreakdown = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => TokenInput.parse(input))
  .handler(async ({ data }) => {
    await dispatcher(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("leads")
      .select("lead_quality, sector, city_area, source, assigned_to")
      .limit(50000);

    const all = rows ?? [];
    const pool = all.filter((row) => row.assigned_to === null);

    const tally = (pick: (row: (typeof all)[number]) => string | null, take: number) => {
      const map = new Map<string, number>();
      for (const row of pool) {
        const key = (pick(row) ?? "").trim() || "উল্লেখ নেই";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return [...map.entries()]
        .map(([label, count]): LeadPoolTally => ({ label, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, take);
    };

    return {
      total: all.length,
      pool: pool.length,
      assigned: all.length - pool.length,
      quality: tally((row) => row.lead_quality, 6),
      sectors: tally((row) => row.sector, 8),
      areas: tally((row) => row.city_area, 8),
    };
  });
