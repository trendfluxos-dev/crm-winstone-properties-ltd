import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "@/lib/audit.server";
import { DHAKA_OFFSET_MS, dhakaDayKey } from "@/lib/dhaka-time";
import {
  ALLOCATION_ARCHITECT,
  ALLOCATION_SYSTEM,
  BILLING_DAY,
  OVERDUE_GRACE_DAYS,
  SERVICE_CURRENCY,
  SERVICE_MONTHLY_AMOUNT,
  type InvoiceStatus,
  type PayoutStatus,
} from "@/lib/service-billing";

/**
 * Monthly service billing state machine.
 *
 * invoice (due) -> verified payment -> invoice paid + service extended
 *               -> internal allocation (system 3,000 / architect 1,000)
 *               -> architect payout item (pending until a provider confirms)
 *
 * Every step is idempotent: the invoice reference is unique per cycle, the
 * transaction is unique per (provider, provider_txn_id), the allocation is
 * unique per (invoice, kind) and a payout is unique per invoice. A webhook
 * replayed ten times therefore activates the service once and creates exactly
 * one ৳1,000 payable.
 */

export function configuredAmount(): number {
  const raw = Number(process.env["SERVICE_MONTHLY_AMOUNT"]);
  return Number.isFinite(raw) && raw > 0 ? raw : SERVICE_MONTHLY_AMOUNT;
}

export type Cycle = {
  month: string;
  billingDate: string;
  start: string;
  end: string;
  reference: string;
};

/** UTC instant of 00:00 Dhaka on the 15th of `month` (yyyy-mm). */
function dhakaBillingInstant(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, BILLING_DAY, -6, 0, 0));
}

export function cycleFor(month: string): Cycle {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const start = dhakaBillingInstant(y, m - 1);
  const end = dhakaBillingInstant(y, m);
  return {
    month,
    billingDate: `${month}-${String(BILLING_DAY).padStart(2, "0")}`,
    start: start.toISOString(),
    end: end.toISOString(),
    reference: `WINSTONE-SVC-${month}`,
  };
}

/** The cycle that is currently being billed (flips on the 15th, Dhaka time). */
export function currentCycle(now: Date = new Date()): Cycle {
  const day = dhakaDayKey(now);
  const dom = Number(day.slice(8, 10));
  const [y = 0, m = 1] = day.split("-").map(Number);
  const anchor =
    dom >= BILLING_DAY ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m - 2, 1));
  return cycleFor(anchor.toISOString().slice(0, 7));
}

export function nextCycle(now: Date = new Date()): Cycle {
  const cur = currentCycle(now);
  const [y = 0, m = 1] = cur.month.split("-").map(Number);
  return cycleFor(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7));
}

function derivedStatus(row: { status: string; due_at: string }): InvoiceStatus {
  const stored = row.status as InvoiceStatus;
  if (stored === "paid" || stored === "pending" || stored === "failed") return stored;
  const overdueAt = new Date(row.due_at).getTime() + OVERDUE_GRACE_DAYS * 86_400_000;
  return Date.now() > overdueAt ? "overdue" : "due";
}

export type InvoiceRow = {
  id: string;
  month: string;
  billingDate: string;
  dueAt: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  reference: string;
  paidAt: string | null;
  serviceActiveUntil: string | null;
};

function toInvoice(row: {
  id: string;
  period_month: string;
  billing_date: string;
  due_at: string;
  period_start: string;
  period_end: string;
  amount: number | string;
  currency: string;
  status: string;
  reference: string;
  paid_at: string | null;
  service_active_until: string | null;
}): InvoiceRow {
  return {
    id: row.id,
    month: row.period_month,
    billingDate: row.billing_date,
    dueAt: row.due_at,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    amount: Number(row.amount),
    currency: row.currency,
    status: derivedStatus(row),
    reference: row.reference,
    paidAt: row.paid_at,
    serviceActiveUntil: row.service_active_until,
  };
}

const INVOICE_COLUMNS =
  "id, period_month, billing_date, due_at, period_start, period_end, amount, currency, status, reference, paid_at, service_active_until";

/** Creates the invoice for a cycle if it does not exist yet. Idempotent. */
export async function ensureInvoice(cycle: Cycle): Promise<InvoiceRow> {
  const { data: existing } = await supabaseAdmin
    .from("service_invoices")
    .select(INVOICE_COLUMNS)
    .eq("period_month", cycle.month)
    .maybeSingle();
  if (existing) return toInvoice(existing);

  const { data, error } = await supabaseAdmin
    .from("service_invoices")
    .insert({
      period_month: cycle.month,
      period_start: cycle.start,
      period_end: cycle.end,
      billing_date: cycle.billingDate,
      due_at: cycle.start,
      amount: configuredAmount(),
      currency: SERVICE_CURRENCY,
      status: "due",
      reference: cycle.reference,
    })
    .select(INVOICE_COLUMNS)
    .single();

  if (error) {
    // A concurrent caller won the unique index — read theirs instead.
    if (error.code === "23505") {
      const { data: raced } = await supabaseAdmin
        .from("service_invoices")
        .select(INVOICE_COLUMNS)
        .eq("period_month", cycle.month)
        .single();
      return toInvoice(raced!);
    }
    throw new Error(error.message);
  }

  await logAudit({
    action: "service_invoice_created",
    entityType: "service_invoice",
    entityId: data.id,
    actorLabel: "billing-system",
    metadata: { month: cycle.month, amount: configuredAmount(), currency: SERVICE_CURRENCY },
  });
  return toInvoice(data);
}

export async function ensureCurrentInvoice(): Promise<InvoiceRow> {
  return ensureInvoice(currentCycle());
}

export type SettleInput = {
  provider: string;
  providerTxnId: string;
  amount: number;
  currency: string;
  invoiceReference?: string | null;
  succeeded: boolean;
  failureReason?: string | null;
  /** How the money was verified: provider webhook, or an audited manual check. */
  verification: "provider_webhook" | "manual_admin";
  actorLabel?: string;
  payload?: Record<string, unknown>;
};

export type SettleResult = {
  duplicate: boolean;
  accepted: boolean;
  invoiceId: string | null;
  reason: string | null;
};

/**
 * Single entry point for "money arrived". Called by the webhook route and by
 * the audited IT Console manual verification. Never called from the browser.
 */
export async function settlePayment(input: SettleInput): Promise<SettleResult> {
  const { data: seen } = await supabaseAdmin
    .from("payment_transactions")
    .select("id, invoice_id, status, verification_status")
    .eq("provider", input.provider)
    .eq("provider_txn_id", input.providerTxnId)
    .maybeSingle();
  if (seen) {
    return {
      duplicate: true,
      accepted: seen.status === "succeeded",
      invoiceId: seen.invoice_id,
      reason: "already processed",
    };
  }

  const invoice = input.invoiceReference
    ? await (async () => {
        const { data } = await supabaseAdmin
          .from("service_invoices")
          .select(INVOICE_COLUMNS)
          .eq("reference", input.invoiceReference!)
          .maybeSingle();
        return data ? toInvoice(data) : null;
      })()
    : await ensureCurrentInvoice();

  const expected = configuredAmount();
  const amountOk = Math.abs(input.amount - expected) < 0.01;
  const currencyOk = input.currency.toUpperCase() === SERVICE_CURRENCY;
  const ok = input.succeeded && amountOk && currencyOk && Boolean(invoice);
  const reason = !invoice
    ? "invoice not found"
    : !input.succeeded
      ? (input.failureReason ?? "payment failed at provider")
      : !amountOk
        ? `amount mismatch: expected ${expected}`
        : !currencyOk
          ? `currency mismatch: expected ${SERVICE_CURRENCY}`
          : null;

  const { data: txn, error: txnError } = await supabaseAdmin
    .from("payment_transactions")
    .insert({
      invoice_id: invoice?.id ?? null,
      provider: input.provider,
      provider_txn_id: input.providerTxnId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      status: ok ? "succeeded" : "failed",
      verification_status: ok ? input.verification : "rejected",
      verified_at: ok ? new Date().toISOString() : null,
      failure_reason: reason,
      payload: (input.payload ?? {}) as never,
    })
    .select("id")
    .single();

  if (txnError) {
    if (txnError.code === "23505") {
      return { duplicate: true, accepted: false, invoiceId: invoice?.id ?? null, reason: "race" };
    }
    throw new Error(txnError.message);
  }

  await logAudit({
    action: ok ? "service_payment_verified" : "service_payment_rejected",
    entityType: "payment_transaction",
    entityId: txn.id,
    actorLabel: input.actorLabel ?? input.provider,
    metadata: {
      provider: input.provider,
      providerTxnId: input.providerTxnId,
      amount: input.amount,
      currency: input.currency,
      verification: input.verification,
      invoice: invoice?.reference ?? null,
      reason,
    },
  });

  if (!ok || !invoice) {
    if (invoice && !input.succeeded) {
      await supabaseAdmin
        .from("service_invoices")
        .update({ status: "failed" })
        .eq("id", invoice.id)
        .neq("status", "paid");
    }
    return { duplicate: false, accepted: false, invoiceId: invoice?.id ?? null, reason };
  }

  await activateService(invoice, txn.id);
  return { duplicate: false, accepted: true, invoiceId: invoice.id, reason: null };
}

/** Marks the invoice paid, writes the internal split and queues the payout. */
async function activateService(invoice: InvoiceRow, transactionId: string): Promise<void> {
  const { data: updated } = await supabaseAdmin
    .from("service_invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      service_active_until: invoice.periodEnd,
    })
    .eq("id", invoice.id)
    .neq("status", "paid")
    .select("id")
    .maybeSingle();

  if (updated) {
    await logAudit({
      action: "service_activated",
      entityType: "service_invoice",
      entityId: invoice.id,
      actorLabel: "billing-system",
      metadata: {
        month: invoice.month,
        activeUntil: invoice.periodEnd,
        transactionId,
      },
    });
  }

  const allocations = [
    { kind: "system_infrastructure", label: "System / Infrastructure", amount: ALLOCATION_SYSTEM },
    {
      kind: "architect_maintenance",
      label: "Architect Maintenance Fee",
      amount: ALLOCATION_ARCHITECT,
    },
  ];

  for (const a of allocations) {
    const { data: inserted } = await supabaseAdmin
      .from("billing_allocations")
      .upsert(
        {
          invoice_id: invoice.id,
          kind: a.kind,
          label: a.label,
          amount: a.amount,
          currency: SERVICE_CURRENCY,
        },
        { onConflict: "invoice_id,kind", ignoreDuplicates: true },
      )
      .select("id")
      .maybeSingle();
    if (inserted) {
      await logAudit({
        action: "billing_allocation_created",
        entityType: "billing_allocation",
        entityId: inserted.id,
        actorLabel: "billing-system",
        metadata: { invoice: invoice.reference, kind: a.kind, amount: a.amount },
      });
    }
  }

  await ensureArchitectPayout(invoice.id, invoice.reference);
}

/** Creates the ৳1,000 payable for a paid invoice, once. */
export async function ensureArchitectPayout(
  invoiceId: string,
  invoiceReference: string,
): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("architect_payouts")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: allocation } = await supabaseAdmin
    .from("billing_allocations")
    .select("id, amount")
    .eq("invoice_id", invoiceId)
    .eq("kind", "architect_maintenance")
    .maybeSingle();

  const { data: profile } = await supabaseAdmin
    .from("architect_payout_profiles")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from("architect_payouts")
    .insert({
      invoice_id: invoiceId,
      allocation_id: allocation?.id ?? null,
      profile_id: profile?.id ?? null,
      amount: allocation ? Number(allocation.amount) : ALLOCATION_ARCHITECT,
      currency: SERVICE_CURRENCY,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error && error.code !== "23505") throw new Error(error.message);
  if (!data) return null;

  await logAudit({
    action: "architect_payout_created",
    entityType: "architect_payout",
    entityId: data.id,
    actorLabel: "billing-system",
    metadata: { invoice: invoiceReference, amount: ALLOCATION_ARCHITECT, status: "pending" },
  });
  return data.id;
}

export type PayoutRow = {
  id: string;
  invoiceId: string;
  invoiceMonth: string | null;
  amount: number;
  currency: string;
  status: PayoutStatus;
  provider: string | null;
  providerReference: string | null;
  requestedAt: string | null;
  confirmedAt: string | null;
  failureReason: string | null;
};

const ALLOWED_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  pending: ["approved", "cancelled"],
  approved: ["ready", "cancelled", "failed"],
  ready: ["paid", "failed", "cancelled"],
  paid: [],
  failed: ["approved", "cancelled"],
  cancelled: [],
};

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Dhaka-time helper used by the UI copy: next billing date after `now`. */
export function nextBillingDate(now: Date = new Date()): string {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const dom = local.getUTCDate();
  const target =
    dom < BILLING_DAY
      ? new Date(Date.UTC(y, m, BILLING_DAY))
      : new Date(Date.UTC(y, m + 1, BILLING_DAY));
  return target.toISOString().slice(0, 10);
}
