import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dhakaMonthBounds, dhakaMonthKey } from "@/lib/dhaka-time";

/**
 * Usage meter and budget guard.
 *
 * Every paid AI / provider call records one row in `ai_usage_events` with the
 * provider, model, consumed units and the cost computed from the rate card in
 * force at that moment. The cost is frozen onto the row, so later price
 * changes never rewrite history.
 *
 * Recording is best-effort by design: a metering failure must never break the
 * feature that ran. Budget enforcement, by contrast, is deliberate and is
 * only ever applied to discretionary AI (see `DISCRETIONARY_OPERATIONS`).
 */

export type UsageUnitKind = "call" | "token" | "second" | "byte" | "message" | "operation";

export type UsageProvider =
  | "lovable-ai"
  | "sarvam"
  | "google-drive"
  | "whatsapp"
  | "storage"
  | "other";

export type RecordUsageInput = {
  provider: UsageProvider;
  /** Stable operation name, e.g. "copilot", "transcription", "drive_backup". */
  operation: string;
  /** Coarse bucket kept for the existing credits report. */
  category?: string;
  model?: string | null;
  unitKind?: UsageUnitKind;
  inputUnits?: number;
  outputUnits?: number;
  /** Billable units; defaults to input + output, or 1 for per-call pricing. */
  units?: number;
  actorProfileId?: string | null;
  detail?: string | null;
  status?: "ok" | "error";
  latencyMs?: number | null;
  /**
   * Stable key for a retryable unit of work (e.g. `analysis:<recordingId>`).
   * A repeated key is silently ignored, so a retried job never double-counts.
   */
  idempotencyKey?: string | null;
};

type RateCard = {
  id: string;
  unit_kind: string;
  credits_per_unit: number;
  amount_per_unit: number;
  currency: string;
};

/** Operations a hard budget cap may block. Call/report paths are never here. */
const DISCRETIONARY_OPERATIONS = new Set([
  "copilot",
  "coach",
  "hq_ask",
  "precall",
  "command_agent",
  "doc_summary",
  "lead_import_ai",
  "report_summary",
]);

const CATEGORY_FOR_OPERATION: Record<string, string> = {
  command_agent: "command_agent",
  hq_ask: "command_agent",
  copilot: "command_agent",
  coach: "command_agent",
  precall: "command_agent",
  transcription: "transcription",
  analysis: "analysis",
  doc_summary: "doc_summary",
  report_summary: "doc_summary",
};

async function findRateCard(
  provider: string,
  model: string | null | undefined,
  operation: string,
): Promise<RateCard | null> {
  const nowIso = new Date().toISOString();
  const { data } = await supabaseAdmin
    .from("provider_rate_cards")
    .select("id, unit_kind, credits_per_unit, amount_per_unit, currency, model, operation")
    .eq("provider", provider)
    .lte("effective_from", nowIso)
    .or(`effective_to.is.null,effective_to.gt.${nowIso}`)
    .order("effective_from", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as (RateCard & { model: string | null; operation: string | null })[];
  if (rows.length === 0) return null;

  // Most specific match wins: model + operation, then operation, then model, then provider default.
  const score = (r: { model: string | null; operation: string | null }) =>
    (r.model && model && r.model === model ? 2 : r.model ? -10 : 0) +
    (r.operation === operation ? 2 : r.operation ? -10 : 0);
  const best = rows
    .map((r) => ({ r, s: score(r) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)[0];
  return best ? best.r : null;
}

export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    const operation = input.operation;
    const inputUnits = input.inputUnits ?? 0;
    const outputUnits = input.outputUnits ?? 0;
    const card = await findRateCard(input.provider, input.model ?? null, operation);
    const unitKind = (input.unitKind ?? card?.unit_kind ?? "call") as UsageUnitKind;
    const billableUnits =
      input.units ?? (unitKind === "call" ? 1 : inputUnits + outputUnits || 1);

    const costCredits = card ? Number(card.credits_per_unit) * billableUnits : 0;
    const costAmount = card ? Number(card.amount_per_unit) * billableUnits : 0;

    const row = {
      category: input.category ?? CATEGORY_FOR_OPERATION[operation] ?? "other",
      provider: input.provider,
      operation,
      model: input.model ?? null,
      unit_kind: unitKind,
      input_units: inputUnits,
      output_units: outputUnits,
      units: billableUnits,
      est_credits: costCredits,
      cost_credits: costCredits,
      cost_amount: costAmount,
      currency: card?.currency ?? "USD",
      rate_card_id: card?.id ?? null,
      actor_profile_id: input.actorProfileId ?? null,
      detail: input.detail ?? null,
      status: input.status ?? "ok",
      latency_ms: input.latencyMs ?? null,
      idempotency_key: input.idempotencyKey ?? null,
    };

    const { error } = await supabaseAdmin.from("ai_usage_events").insert(row);
    if (error) {
      // 23505 = duplicate idempotency key: the work was already billed.
      if (error.code !== "23505") console.error("[billing-meter] insert failed", error.message);
      return;
    }

    if (!card) {
      console.warn(`[billing-meter] no rate card for ${input.provider}/${operation}`);
    }
    await checkBudgetThresholds();
  } catch (err) {
    console.error("[billing-meter] record failed", err);
  }
}

export type BudgetState = {
  month: string;
  budget: number;
  spent: number;
  percent: number;
  hardCap: boolean;
  blocked: boolean;
};

async function monthSpend(month: string, profileId?: string | null): Promise<number> {
  const { start, end } = dhakaMonthBounds(month);
  let q = supabaseAdmin
    .from("ai_usage_events")
    .select("cost_credits")
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(50000);
  if (profileId) q = q.eq("actor_profile_id", profileId);
  const { data } = await q;
  return (data ?? []).reduce((s, r) => s + (Number(r.cost_credits) || 0), 0);
}

export async function getBudgetState(profileId?: string | null): Promise<BudgetState | null> {
  const month = dhakaMonthKey();
  const { data: org } = await supabaseAdmin
    .from("billing_budgets")
    .select("monthly_credit_budget, hard_cap, is_active")
    .eq("scope", "org")
    .maybeSingle();
  if (!org || !org.is_active || Number(org.monthly_credit_budget) <= 0) return null;

  const budget = Number(org.monthly_credit_budget);
  const spent = await monthSpend(month);
  const percent = budget > 0 ? (spent / budget) * 100 : 0;
  let blocked = Boolean(org.hard_cap) && spent >= budget;

  if (!blocked && profileId) {
    const { data: agent } = await supabaseAdmin
      .from("billing_budgets")
      .select("monthly_credit_budget, hard_cap, is_active")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (agent?.is_active && agent.hard_cap && Number(agent.monthly_credit_budget) > 0) {
      const agentSpent = await monthSpend(month, profileId);
      blocked = agentSpent >= Number(agent.monthly_credit_budget);
    }
  }

  return {
    month,
    budget: Math.round(budget * 100) / 100,
    spent: Math.round(spent * 100) / 100,
    percent: Math.round(percent * 10) / 10,
    hardCap: Boolean(org.hard_cap),
    blocked,
  };
}

/**
 * Guard for discretionary AI. Returns null when the call may proceed, or a
 * user-facing Bengali reason when the hard cap has been reached. Operations
 * outside `DISCRETIONARY_OPERATIONS` — anything in the call, report or
 * recording path — are never blocked.
 */
export async function assertWithinBudget(
  operation: string,
  actorProfileId?: string | null,
): Promise<string | null> {
  if (!DISCRETIONARY_OPERATIONS.has(operation)) return null;
  try {
    const state = await getBudgetState(actorProfileId ?? null);
    if (state?.blocked) {
      return "এই মাসের এআই বাজেট শেষ হয়ে গেছে। কল ও রিপোর্ট স্বাভাবিকভাবে চলবে; ঐচ্ছিক এআই সুবিধা মাস শেষ না হওয়া পর্যন্ত বন্ধ।";
    }
  } catch (err) {
    console.error("[billing-meter] budget check failed", err);
  }
  return null;
}

/** Raises one alert per threshold per month; repeated calls are idempotent. */
async function checkBudgetThresholds(): Promise<void> {
  const { data: org } = await supabaseAdmin
    .from("billing_budgets")
    .select("monthly_credit_budget, alert_thresholds, is_active")
    .eq("scope", "org")
    .maybeSingle();
  if (!org || !org.is_active || Number(org.monthly_credit_budget) <= 0) return;

  const month = dhakaMonthKey();
  const budget = Number(org.monthly_credit_budget);
  const spent = await monthSpend(month);
  const percent = (spent / budget) * 100;
  const thresholds = (org.alert_thresholds ?? [50, 80, 100]) as number[];
  const hit = thresholds.filter((t) => percent >= t).sort((a, b) => b - a)[0];
  if (!hit) return;

  const code = `ai_budget_${month}_${hit}`;
  const { data: existing } = await supabaseAdmin
    .from("system_alerts")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  if (existing) return;

  await supabaseAdmin.from("system_alerts").insert({
    code,
    severity: hit >= 100 ? "critical" : hit >= 80 ? "warning" : "info",
    title: `এআই বাজেটের ${hit}% ব্যবহার হয়েছে (${month})`,
    detail: `এই মাসে ব্যয় ${spent.toFixed(2)} ক্রেডিট, বাজেট ${budget.toFixed(2)} ক্রেডিট।`,
    action: "/credits",
  });
}
