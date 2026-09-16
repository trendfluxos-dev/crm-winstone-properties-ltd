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

export type CreditsProviderRow = {
  provider: string;
  model: string | null;
  calls: number;
  credits: number;
  amount: number;
  currency: string;
};

export type CreditsRateCard = {
  provider: string;
  model: string | null;
  operation: string | null;
  unitKind: string;
  creditsPerUnit: number;
  amountPerUnit: number;
  currency: string;
};

export type CreditsReport = {
  month: string; // yyyy-mm
  monthLabel: string;
  totals: { calls: number; credits: number; amount: number; currency: string };
  categories: CreditsCategoryRow[];
  providers: CreditsProviderRow[];
  /** Live price list the ledger prices against. */
  rateCards: CreditsRateCard[];
  daily: CreditsDayRow[];
  agents: CreditsAgentRow[];
  /**
   * Run-rate projected from the ledger itself. `basis` is "none" when the
   * month has no recorded usage — the UI must then show "no data", never a
   * guessed number.
   */
  projection: {
    basis: "measured" | "none";
    elapsedDays: number;
    monthDays: number;
    perDay: number;
    monthEnd: number;
  };
  /** Active monthly budget and how much of it this month has consumed. */
  budget: {
    budget: number;
    spent: number;
    percent: number;
    hardCap: boolean;
    blocked: boolean;
  } | null;
  /** Rolling last-7-day view, independent of the selected month. */
  recent7: { calls: number; credits: number; perDay: number; next7: number };
};

const CATEGORY_LABEL: Record<string, string> = {
  command_agent: "Winstone AI প্রশ্ন",
  transcription: "কল ট্রান্সক্রিপ্ট",
  analysis: "এআই সারসংক্ষেপ ও শ্রেণিবিন্যাস",
  doc_summary: "ডকুমেন্ট সারসংক্ষেপ",
  other: "অন্যান্য",
};

export const getCreditsReport = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null; month?: string }) => input)
  .handler(async ({ data }): Promise<CreditsReport> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);

    const { dhakaDayKey, dhakaMonthBounds, dhakaMonthDays, dhakaMonthElapsedDays, dhakaMonthKey } =
      await import("@/lib/dhaka-time");

    const month = /^\d{4}-\d{2}$/.test(data.month ?? "") ? (data.month as string) : dhakaMonthKey();
    const { start, end, label } = dhakaMonthBounds(month);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: events, error } = await supabaseAdmin
      .from("ai_usage_events")
      .select(
        "category, provider, model, units, est_credits, cost_credits, cost_amount, currency, actor_profile_id, created_at",
      )
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) throw new Error(error.message);

    const rows = events ?? [];
    const creditsOf = (r: { cost_credits?: number | null; est_credits?: number | null }) =>
      Number(r.cost_credits ?? r.est_credits ?? 0) || 0;

    // Rolling 7-day window, independent of the selected month.
    const since = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    const { data: recentRows } = await supabaseAdmin
      .from("ai_usage_events")
      .select("est_credits, cost_credits")
      .gte("created_at", since)
      .limit(20000);
    const recentCredits =
      Math.round((recentRows ?? []).reduce((s, r) => s + creditsOf(r), 0) * 100) / 100;
    const recent7 = {
      calls: (recentRows ?? []).length,
      credits: recentCredits,
      perDay: Math.round((recentCredits / 7) * 100) / 100,
      next7: Math.round(recentCredits * 100) / 100,
    };

    const agentIds = [...new Set(rows.map((r) => r.actor_profile_id).filter(Boolean))] as string[];
    const nameById = new Map<string, string>();
    if (agentIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .in("id", agentIds);
      for (const p of profiles ?? []) nameById.set(p.id, p.name);
    }

    type Bucket = { calls: number; credits: number; amount: number; currency: string };
    const catMap = new Map<string, Bucket>();
    const dayMap = new Map<string, Bucket>();
    const agentMap = new Map<string | null, Bucket>();
    const providerMap = new Map<string, Bucket & { provider: string; model: string | null }>();

    let totalCredits = 0;
    let totalAmount = 0;
    let currency = "USD";

    for (const r of rows) {
      const credits = creditsOf(r);
      const amount = Number(r.cost_amount ?? 0) || 0;
      currency = r.currency ?? currency;
      totalCredits += credits;
      totalAmount += amount;

      const bump = <K>(map: Map<K, Bucket>, key: K) => {
        const cur = map.get(key) ?? { calls: 0, credits: 0, amount: 0, currency };
        cur.calls += 1;
        cur.credits += credits;
        cur.amount += amount;
        map.set(key, cur);
      };
      bump(catMap, r.category);
      bump(dayMap, dhakaDayKey(r.created_at));
      bump(agentMap, r.actor_profile_id ?? null);

      const pKey = `${r.provider ?? "unknown"}::${r.model ?? ""}`;
      const p = providerMap.get(pKey) ?? {
        provider: r.provider ?? "unknown",
        model: r.model ?? null,
        calls: 0,
        credits: 0,
        amount: 0,
        currency,
      };
      p.calls += 1;
      p.credits += credits;
      p.amount += amount;
      providerMap.set(pKey, p);
    }

    const round = (n: number) => Math.round(n * 100) / 100;

    // Run-rate comes from the ledger. With no rows this month the projection
    // is explicitly "none" rather than an invented figure.
    const elapsedDays = dhakaMonthElapsedDays(month);
    const monthDays = dhakaMonthDays(month);
    const perDay = elapsedDays > 0 ? totalCredits / elapsedDays : 0;
    const projection =
      rows.length > 0
        ? {
            basis: "measured" as const,
            elapsedDays,
            monthDays,
            perDay: round(perDay),
            monthEnd: round(perDay * monthDays),
          }
        : { basis: "none" as const, elapsedDays, monthDays, perDay: 0, monthEnd: 0 };

    const { data: cards } = await supabaseAdmin
      .from("provider_rate_cards")
      .select("provider, model, operation, unit_kind, credits_per_unit, amount_per_unit, currency")
      .is("effective_to", null)
      .order("provider", { ascending: true });

    const { getBudgetState } = await import("@/lib/billing-meter.server");
    const budgetState = await getBudgetState();

    return {
      month,
      monthLabel: label,
      totals: {
        calls: rows.length,
        credits: round(totalCredits),
        amount: round(totalAmount),
        currency,
      },
      categories: [...catMap.entries()]
        .sort((a, b) => b[1].credits - a[1].credits)
        .map(([category, v]) => ({
          category,
          label: CATEGORY_LABEL[category] ?? category,
          calls: v.calls,
          credits: round(v.credits),
        })),
      rateCards: (cards ?? []).map((c) => ({
        provider: c.provider,
        model: c.model,
        operation: c.operation,
        unitKind: c.unit_kind,
        creditsPerUnit: Number(c.credits_per_unit) || 0,
        amountPerUnit: Number(c.amount_per_unit) || 0,
        currency: c.currency,
      })),
      providers: [...providerMap.values()]
        .sort((a, b) => b.credits - a.credits)
        .map((v) => ({
          provider: v.provider,
          model: v.model,
          calls: v.calls,
          credits: round(v.credits),
          amount: round(v.amount),
          currency: v.currency,
        })),
      daily: [...dayMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, v]) => ({ day, calls: v.calls, credits: round(v.credits) })),
      agents: [...agentMap.entries()]
        .sort((a, b) => b[1].credits - a[1].credits)
        .map(([agentId, v]) => ({
          agentId,
          name: agentId ? (nameById.get(agentId) ?? "অজানা") : "সিস্টেম / অজানা",
          calls: v.calls,
          credits: round(v.credits),
        })),
      projection,
      budget: budgetState
        ? {
            budget: budgetState.budget,
            spent: budgetState.spent,
            percent: budgetState.percent,
            hardCap: budgetState.hardCap,
            blocked: budgetState.blocked,
          }
        : null,
      recent7,
    };
  });
