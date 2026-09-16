import { createServerFn } from "@tanstack/react-start";

/**
 * Authority-only billing controls: read invoice snapshots, and set the
 * monthly budget, alert thresholds and hard-cap switch. The hard cap only
 * ever pauses discretionary AI features — call, report and recording paths
 * are never blocked by a budget.
 */

export type InvoiceSummary = {
  id: string;
  month: string;
  label: string;
  status: string;
  calls: number;
  credits: number;
  amount: number;
  currency: string;
  closedAt: string;
  generationHash: string;
};

export type BudgetSettings = {
  monthlyCreditBudget: number;
  alertThresholds: number[];
  hardCap: boolean;
  isActive: boolean;
};

export const listBillingInvoices = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(async ({ data }): Promise<InvoiceSummary[]> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { dhakaMonthBounds } = await import("@/lib/dhaka-time");
    const { data: rows, error } = await supabaseAdmin
      .from("billing_invoices")
      .select(
        "id, period_month, status, total_calls, total_credits, total_amount, currency, closed_at, generation_hash",
      )
      .order("period_month", { ascending: false })
      .limit(24);
    if (error) throw new Error(error.message);

    return (rows ?? []).map((r) => ({
      id: r.id,
      month: r.period_month,
      label: dhakaMonthBounds(r.period_month).label,
      status: r.status,
      calls: r.total_calls,
      credits: Number(r.total_credits),
      amount: Number(r.total_amount),
      currency: r.currency,
      closedAt: r.closed_at,
      generationHash: r.generation_hash,
    }));
  });

export const getBudgetSettings = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(async ({ data }): Promise<BudgetSettings | null> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("billing_budgets")
      .select("monthly_credit_budget, alert_thresholds, hard_cap, is_active")
      .eq("scope", "org")
      .maybeSingle();
    if (!row) return null;
    return {
      monthlyCreditBudget: Number(row.monthly_credit_budget),
      alertThresholds: (row.alert_thresholds ?? []) as number[],
      hardCap: row.hard_cap,
      isActive: row.is_active,
    };
  });

export const saveBudgetSettings = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      adminToken?: string | null;
      monthlyCreditBudget: number;
      alertThresholds?: number[];
      hardCap?: boolean;
      isActive?: boolean;
    }) => input,
  )
  .handler(async ({ data }): Promise<BudgetSettings> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);

    const budget = Number(data.monthlyCreditBudget);
    if (!Number.isFinite(budget) || budget < 0) throw new Error("বাজেটের মান সঠিক নয়");
    const thresholds = (data.alertThresholds ?? [50, 80, 100])
      .map((n) => Math.round(Number(n)))
      .filter((n) => n > 0 && n <= 200);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      scope: "org",
      monthly_credit_budget: budget,
      alert_thresholds: thresholds.length > 0 ? thresholds : [50, 80, 100],
      hard_cap: Boolean(data.hardCap),
      is_active: data.isActive ?? true,
    };

    const { data: existing } = await supabaseAdmin
      .from("billing_budgets")
      .select("id")
      .eq("scope", "org")
      .maybeSingle();

    const { error } = existing
      ? await supabaseAdmin.from("billing_budgets").update(row).eq("id", existing.id)
      : await supabaseAdmin.from("billing_budgets").insert(row);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      actor_label: "authority",
      action: "billing_budget_updated",
      entity_type: "billing_budget",
      entity_id: "org",
      metadata: row,
    });

    return {
      monthlyCreditBudget: budget,
      alertThresholds: row.alert_thresholds,
      hardCap: row.hard_cap,
      isActive: row.is_active,
    };
  });

export const closeBillingMonthNow = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null; month?: string }) => input)
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { closeBillingMonth } = await import("@/lib/billing-invoice.server");
    return closeBillingMonth(data.month);
  });
