import { createServerFn } from "@tanstack/react-start";

export type CreditsCategoryRow = {
  category: string;
  label: string;
  calls: number;
  credits: number;
};

export type CreditsDayRow = { day: string; calls: number; credits: number };

export type CreditsAgentRow = {
  agentId: string | null;
  name: string;
  calls: number;
  credits: number;
};

export type CreditsReport = {
  month: string; // yyyy-mm
  monthLabel: string;
  totals: { calls: number; credits: number };
  categories: CreditsCategoryRow[];
  daily: CreditsDayRow[];
  agents: CreditsAgentRow[];
  /** Static monthly projection agreed with the team, for context. */
  projection: { aiOnly: number; withDevelopment: number };
};

const CATEGORY_LABEL: Record<string, string> = {
  command_agent: "Winstone AI প্রশ্ন",
  transcription: "কল ট্রান্সক্রিপ্ট",
  analysis: "এআই সারসংক্ষেপ ও শ্রেণিবিন্যাস",
  doc_summary: "ডকুমেন্ট সারসংক্ষেপ",
  other: "অন্যান্য",
};

/** Month bounds in Dhaka time (UTC+6), returned as UTC ISO for the query. */
function monthBounds(month: string): { start: string; end: string; label: string } {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, -6, 0, 0)); // 00:00 Dhaka = 18:00 prev day UTC
  const end = new Date(Date.UTC(y, m, 1, -6, 0, 0));
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return { start: start.toISOString(), end: end.toISOString(), label };
}

export const getCreditsReport = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null; month?: string }) => input)
  .handler(async ({ data }): Promise<CreditsReport> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);

    const month = /^\d{4}-\d{2}$/.test(data.month ?? "")
      ? (data.month as string)
      : new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 7);
    const { start, end, label } = monthBounds(month);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: events, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select("category, units, est_credits, actor_profile_id, created_at")
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);

    const rows = events ?? [];

    const agentIds = [...new Set(rows.map((r) => r.actor_profile_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .in("id", agentIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.name);
    }

    const catMap = new Map<string, { calls: number; credits: number }>();
    const dayMap = new Map<string, { calls: number; credits: number }>();
    const agentMap = new Map<string | null, { calls: number; credits: number }>();
    for (const r of rows) {
      const credits = Number(r.est_credits) || 0;
      const bump = (map: Map<any, { calls: number; credits: number }>, key: any) => {
        const cur = map.get(key) ?? { calls: 0, credits: 0 };
        cur.calls += 1;
        cur.credits += credits;
        map.set(key, cur);
      };
      bump(catMap, r.category);
      // Day bucket in Dhaka time
      const day = new Date(new Date(r.created_at).getTime() + 6 * 3_600_000)
        .toISOString()
        .slice(0, 10);
      bump(dayMap, day);
      bump(agentMap, r.actor_profile_id ?? null);
    }

    return {
      month,
      monthLabel: label,
      totals: {
        calls: rows.length,
        credits: Math.round(rows.reduce((s, r) => s + (Number(r.est_credits) || 0), 0) * 100) / 100,
      },
      categories: [...catMap.entries()]
        .sort((a, b) => b[1].credits - a[1].credits)
        .map(([category, v]) => ({
          category,
          label: CATEGORY_LABEL[category] ?? category,
          calls: v.calls,
          credits: Math.round(v.credits * 100) / 100,
        })),
      daily: [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, calls: v.calls, credits: Math.round(v.credits * 100) / 100 })),
      agents: [...agentMap.entries()]
        .sort((a, b) => b[1].credits - a[1].credits)
        .map(([agentId, v]) => ({
          agentId,
          name: agentId ? (nameById.get(agentId) ?? "অজানা") : "সিস্টেম / অজানা",
          calls: v.calls,
          credits: Math.round(v.credits * 100) / 100,
        })),
      projection: { aiOnly: 525, withDevelopment: 650 },
    };
  });
