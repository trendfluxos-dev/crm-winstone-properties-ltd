import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { dhakaMonthBounds, dhakaMonthKey, previousDhakaMonth } from "@/lib/dhaka-time";

/**
 * Month-close snapshot.
 *
 * Once a Dhaka calendar month has ended, its ledger rows are aggregated once
 * and frozen into `billing_invoices` / `billing_invoice_lines`. The snapshot
 * is idempotent — `period_month` is unique, so re-running the job returns the
 * existing invoice instead of producing a second one.
 */

export type CloseResult = {
  month: string;
  created: boolean;
  invoiceId: string;
  totalCalls: number;
  totalCredits: number;
  totalAmount: number;
};

type Line = { dimension: string; key: string; label: string; calls: number; credits: number; amount: number };

function hashOf(input: string): string {
  // FNV-1a: a stable content fingerprint, used only to prove a snapshot was
  // not edited after closing. Not a security primitive.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function closeBillingMonth(monthInput?: string): Promise<CloseResult> {
  const month = /^\d{4}-\d{2}$/.test(monthInput ?? "")
    ? (monthInput as string)
    : previousDhakaMonth(dhakaMonthKey());

  if (month >= dhakaMonthKey()) {
    throw new Error("চলতি বা ভবিষ্যতের মাস বন্ধ করা যাবে না");
  }

  const { data: existing } = await supabaseAdmin
    .from("billing_invoices")
    .select("id, total_calls, total_credits, total_amount")
    .eq("period_month", month)
    .maybeSingle();
  if (existing) {
    return {
      month,
      created: false,
      invoiceId: existing.id,
      totalCalls: existing.total_calls,
      totalCredits: Number(existing.total_credits),
      totalAmount: Number(existing.total_amount),
    };
  }

  const { start, end } = dhakaMonthBounds(month);
  const { data: events, error } = await supabaseAdmin
    .from("ai_usage_events")
    .select("category, provider, model, cost_credits, est_credits, cost_amount, currency, actor_profile_id")
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(50000);
  if (error) throw new Error(error.message);
  const rows = events ?? [];

  const buckets = new Map<string, Line>();
  let totalCredits = 0;
  let totalAmount = 0;
  let currency = "USD";

  const add = (dimension: string, key: string, label: string, credits: number, amount: number) => {
    const id = `${dimension}::${key}`;
    const cur = buckets.get(id) ?? { dimension, key, label, calls: 0, credits: 0, amount: 0 };
    cur.calls += 1;
    cur.credits += credits;
    cur.amount += amount;
    buckets.set(id, cur);
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

  for (const r of rows) {
    const credits = Number(r.cost_credits ?? r.est_credits ?? 0) || 0;
    const amount = Number(r.cost_amount ?? 0) || 0;
    currency = r.currency ?? currency;
    totalCredits += credits;
    totalAmount += amount;

    const provider = r.provider ?? "unknown";
    add("provider", provider, provider, credits, amount);
    add("model", `${provider}:${r.model ?? "default"}`, r.model ?? `${provider} (default)`, credits, amount);
    add("category", r.category, r.category, credits, amount);
    const agentKey = r.actor_profile_id ?? "system";
    add("agent", agentKey, r.actor_profile_id ? (nameById.get(agentKey) ?? "অজানা") : "সিস্টেম", credits, amount);
  }

  const lines = [...buckets.values()].map((l) => ({
    ...l,
    credits: Math.round(l.credits * 1e6) / 1e6,
    amount: Math.round(l.amount * 1e6) / 1e6,
  }));

  const fingerprint = hashOf(
    JSON.stringify({ month, calls: rows.length, totalCredits, totalAmount, lines }),
  );

  const { data: invoice, error: invErr } = await supabaseAdmin
    .from("billing_invoices")
    .insert({
      period_month: month,
      period_start: start,
      period_end: end,
      status: "closed",
      total_calls: rows.length,
      total_credits: Math.round(totalCredits * 1e6) / 1e6,
      total_amount: Math.round(totalAmount * 1e6) / 1e6,
      currency,
      generation_hash: fingerprint,
    })
    .select("id")
    .single();

  if (invErr) {
    // A concurrent run won the unique index: return that invoice instead.
    if (invErr.code === "23505") return closeBillingMonth(month);
    throw new Error(invErr.message);
  }

  if (lines.length > 0) {
    const { error: lineErr } = await supabaseAdmin
      .from("billing_invoice_lines")
      .insert(lines.map((l) => ({ ...l, invoice_id: invoice.id })));
    if (lineErr) throw new Error(lineErr.message);
  }

  await supabaseAdmin.from("audit_logs").insert({
    actor_label: "billing-close-job",
    action: "billing_month_closed",
    entity_type: "billing_invoice",
    entity_id: invoice.id,
    metadata: {
      month,
      calls: rows.length,
      credits: totalCredits,
      amount: totalAmount,
      generation_hash: fingerprint,
    },
  });

  return {
    month,
    created: true,
    invoiceId: invoice.id,
    totalCalls: rows.length,
    totalCredits: Math.round(totalCredits * 1e6) / 1e6,
    totalAmount: Math.round(totalAmount * 1e6) / 1e6,
  };
}
