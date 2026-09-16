import { createServerFn } from "@tanstack/react-start";

/**
 * Billing server functions.
 *
 * Read surface  : Executive HQ (authority token) — invoice state, history,
 *                 next due date. No bank details, no payout internals.
 * Control surface: IT Console (full admin token) — allocations, architect
 *                 payout profile and lifecycle, provider health, manual
 *                 payment verification.
 * Sales agents and coordinators can call none of these.
 */

import type { InvoiceStatus, PayoutStatus } from "@/lib/service-billing";

export type BillingOverview = {
  amount: number;
  currency: string;
  billingDay: number;
  current: {
    id: string;
    month: string;
    reference: string;
    status: InvoiceStatus;
    billingDate: string;
    dueAt: string;
    paidAt: string | null;
    serviceActiveUntil: string | null;
  };
  nextDueDate: string;
  serviceActive: boolean;
  lastPayment: {
    provider: string;
    amount: number;
    currency: string;
    verifiedAt: string | null;
    reference: string;
  } | null;
  invoices: {
    month: string;
    reference: string;
    status: InvoiceStatus;
    amount: number;
    billingDate: string;
    paidAt: string | null;
  }[];
  payments: {
    provider: string;
    providerTxnId: string;
    amount: number;
    currency: string;
    status: string;
    verification: string;
    createdAt: string;
  }[];
  paymentProvider: { configured: boolean; message: string };
};

export const getBillingOverview = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(async ({ data }): Promise<BillingOverview> => {
    const { resolveCaller, requireAuthority } = await import("./access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureCurrentInvoice, nextBillingDate, configuredAmount } =
      await import("./service-billing.server");
    const { paymentProviderHealth } = await import("./payment-adapter.server");
    const { BILLING_DAY, SERVICE_CURRENCY } = await import("./service-billing");

    const current = await ensureCurrentInvoice();

    const { data: invoices } = await supabaseAdmin
      .from("service_invoices")
      .select("period_month, reference, status, amount, billing_date, paid_at, due_at")
      .order("period_month", { ascending: false })
      .limit(24);

    const { data: payments } = await supabaseAdmin
      .from("payment_transactions")
      .select(
        "provider, provider_txn_id, amount, currency, status, verification_status, verified_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(24);

    const lastOk = (payments ?? []).find((p) => p.status === "succeeded");
    const health = paymentProviderHealth();

    return {
      amount: configuredAmount(),
      currency: SERVICE_CURRENCY,
      billingDay: BILLING_DAY,
      current: {
        id: current.id,
        month: current.month,
        reference: current.reference,
        status: current.status,
        billingDate: current.billingDate,
        dueAt: current.dueAt,
        paidAt: current.paidAt,
        serviceActiveUntil: current.serviceActiveUntil,
      },
      nextDueDate: nextBillingDate(),
      serviceActive: Boolean(
        current.serviceActiveUntil && new Date(current.serviceActiveUntil).getTime() > Date.now(),
      ),
      lastPayment: lastOk
        ? {
            provider: lastOk.provider,
            amount: Number(lastOk.amount),
            currency: lastOk.currency,
            verifiedAt: lastOk.verified_at,
            reference: lastOk.provider_txn_id,
          }
        : null,
      invoices: (invoices ?? []).map((i) => ({
        month: i.period_month,
        reference: i.reference,
        status: (i.status === "due" && Date.now() > new Date(i.due_at).getTime() + 7 * 86_400_000
          ? "overdue"
          : i.status) as InvoiceStatus,
        amount: Number(i.amount),
        billingDate: i.billing_date,
        paidAt: i.paid_at,
      })),
      payments: (payments ?? []).map((p) => ({
        provider: p.provider,
        providerTxnId: p.provider_txn_id,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status,
        verification: p.verification_status,
        createdAt: p.created_at,
      })),
      paymentProvider: { configured: health.configured, message: health.message },
    };
  });

/**
 * PAY / RENEW. Creates a provider checkout when a gateway is connected;
 * otherwise returns an honest "not configured" answer with the invoice
 * reference so the payment can be made by bank transfer and verified in the
 * IT Console. It never marks anything paid.
 */
export const startServicePayment = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(
    async ({
      data,
    }): Promise<{
      configured: boolean;
      checkoutUrl: string | null;
      reference: string;
      amount: number;
      currency: string;
      message: string;
    }> => {
      const { resolveCaller, requireAuthority } = await import("./access.server");
      requireAuthority(await resolveCaller(data.adminToken ?? null));

      const { ensureCurrentInvoice, configuredAmount } = await import("./service-billing.server");
      const { getPaymentProvider, paymentProviderHealth } =
        await import("./payment-adapter.server");
      const { SERVICE_CURRENCY } = await import("./service-billing");

      const invoice = await ensureCurrentInvoice();
      const provider = getPaymentProvider();

      if (!provider) {
        return {
          configured: false,
          checkoutUrl: null,
          reference: invoice.reference,
          amount: configuredAmount(),
          currency: SERVICE_CURRENCY,
          message: paymentProviderHealth().message,
        };
      }

      const checkout = await provider.createCheckout({
        invoiceReference: invoice.reference,
        amount: configuredAmount(),
        currency: SERVICE_CURRENCY,
      });
      return {
        configured: true,
        checkoutUrl: checkout.checkoutUrl,
        reference: invoice.reference,
        amount: configuredAmount(),
        currency: SERVICE_CURRENCY,
        message: "চেকআউট তৈরি হয়েছে",
      };
    },
  );

export type BillingControl = {
  allocations: { month: string; kind: string; label: string; amount: number }[];
  payouts: {
    id: string;
    invoiceMonth: string | null;
    amount: number;
    currency: string;
    status: PayoutStatus;
    provider: string | null;
    providerReference: string | null;
    requestedAt: string | null;
    confirmedAt: string | null;
    failureReason: string | null;
  }[];
  profile: {
    id: string;
    beneficiaryName: string;
    bankName: string;
    branchName: string | null;
    currency: string;
    accountMasked: string | null;
    routingNumber: string | null;
    verifiedAt: string | null;
  } | null;
  paymentProvider: {
    configured: boolean;
    providerId: string | null;
    message: string;
    webhookSecretConfigured: boolean;
  };
  payoutProvider: { configured: boolean; providerId: string | null; message: string };
  encryptionConfigured: boolean;
};

export const getBillingControl = createServerFn({ method: "POST" })
  .inputValidator((input: { adminToken?: string | null }) => input)
  .handler(async ({ data }): Promise<BillingControl> => {
    const { requireAdminToken } = await import("./admin-gate.server");
    requireAdminToken(data.adminToken ?? null);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { paymentProviderHealth } = await import("./payment-adapter.server");
    const { payoutProviderHealth } = await import("./architect-payout.server");
    const { encryptionConfigured } = await import("./billing-crypto.server");

    const { data: allocations } = await supabaseAdmin
      .from("billing_allocations")
      .select("kind, label, amount, service_invoices(period_month)")
      .order("created_at", { ascending: false })
      .limit(48);

    const { data: payouts } = await supabaseAdmin
      .from("architect_payouts")
      .select(
        "id, amount, currency, status, provider, provider_reference, requested_at, confirmed_at, failure_reason, service_invoices(period_month)",
      )
      .order("created_at", { ascending: false })
      .limit(24);

    const { data: profile } = await supabaseAdmin
      .from("architect_payout_profiles")
      .select(
        "id, beneficiary_name, bank_name, branch_name, currency, account_number_masked, routing_number, verified_at",
      )
      .eq("is_active", true)
      .maybeSingle();

    const payHealth = paymentProviderHealth();
    const outHealth = payoutProviderHealth();

    return {
      allocations: (allocations ?? []).map((a) => ({
        month:
          (a as unknown as { service_invoices?: { period_month?: string } }).service_invoices
            ?.period_month ?? "—",
        kind: a.kind,
        label: a.label,
        amount: Number(a.amount),
      })),
      payouts: (payouts ?? []).map((p) => ({
        id: p.id,
        invoiceMonth:
          (p as unknown as { service_invoices?: { period_month?: string } }).service_invoices
            ?.period_month ?? null,
        amount: Number(p.amount),
        currency: p.currency,
        status: p.status as PayoutStatus,
        provider: p.provider,
        providerReference: p.provider_reference,
        requestedAt: p.requested_at,
        confirmedAt: p.confirmed_at,
        failureReason: p.failure_reason,
      })),
      profile: profile
        ? {
            id: profile.id,
            beneficiaryName: profile.beneficiary_name,
            bankName: profile.bank_name,
            branchName: profile.branch_name,
            currency: profile.currency,
            accountMasked: profile.account_number_masked,
            routingNumber: profile.routing_number,
            verifiedAt: profile.verified_at,
          }
        : null,
      paymentProvider: {
        configured: payHealth.configured,
        providerId: payHealth.providerId,
        message: payHealth.message,
        webhookSecretConfigured: payHealth.webhookSecretConfigured,
      },
      payoutProvider: outHealth,
      encryptionConfigured: encryptionConfigured(),
    };
  });

/** IT Console records a bank/manual payment. Server-verified and audited. */
export const verifyManualPayment = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      adminToken?: string | null;
      reference: string;
      providerTxnId: string;
      amount: number;
      invoiceReference?: string | null;
      note?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("./admin-gate.server");
    requireAdminToken(data.adminToken ?? null);

    const txnId = data.providerTxnId.trim();
    if (!txnId) throw new Error("লেনদেনের রেফারেন্স লাগবে");
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("টাকার অঙ্ক সঠিক নয়");

    const { settlePayment } = await import("./service-billing.server");
    const { SERVICE_CURRENCY } = await import("./service-billing");
    return settlePayment({
      provider: data.reference.trim() || "manual_bank_transfer",
      providerTxnId: txnId,
      amount,
      currency: SERVICE_CURRENCY,
      invoiceReference: data.invoiceReference ?? null,
      succeeded: true,
      verification: "manual_admin",
      actorLabel: "it_console",
      payload: data.note ? { note: data.note } : {},
    });
  });

/** Architect bank profile. Account number is encrypted; only the mask returns. */
export const saveArchitectProfile = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      adminToken?: string | null;
      beneficiaryName: string;
      bankName: string;
      branchName?: string | null;
      accountNumber?: string | null;
      routingNumber?: string | null;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("./admin-gate.server");
    requireAdminToken(data.adminToken ?? null);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptSecretValue, maskAccountNumber } = await import("./billing-crypto.server");
    const { logAudit } = await import("./audit.server");
    const { SERVICE_CURRENCY } = await import("./service-billing");

    const account = (data.accountNumber ?? "").trim();
    const routing = (data.routingNumber ?? "").trim();

    const base: Record<string, unknown> = {
      beneficiary_name: data.beneficiaryName.trim(),
      bank_name: data.bankName.trim(),
      branch_name: data.branchName?.trim() || null,
      currency: SERVICE_CURRENCY,
      // Routing number stays blank until it is explicitly supplied.
      routing_number: routing || null,
      is_active: true,
    };
    if (account) {
      base["account_number_encrypted"] = encryptSecretValue(account);
      base["account_number_masked"] = maskAccountNumber(account);
    }

    const { data: existing } = await supabaseAdmin
      .from("architect_payout_profiles")
      .select("id")
      .eq("is_active", true)
      .maybeSingle();

    const { error } = existing
      ? await supabaseAdmin
          .from("architect_payout_profiles")
          .update(base as never)
          .eq("id", existing.id)
      : await supabaseAdmin.from("architect_payout_profiles").insert(base as never);
    if (error) throw new Error(error.message);

    await logAudit({
      action: "architect_profile_updated",
      entityType: "architect_payout_profile",
      entityId: existing?.id ?? null,
      actorLabel: "it_console",
      metadata: {
        beneficiary: base["beneficiary_name"],
        bank: base["bank_name"],
        branch: base["branch_name"],
        accountChanged: Boolean(account),
        routingProvided: Boolean(routing),
      },
    });
    return { ok: true };
  });

/**
 * Advances a payout through its lifecycle. "paid" is only reachable from a
 * provider confirmation or an IT Console confirmation carrying a real bank
 * reference — never automatically.
 */
export const updateArchitectPayout = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      adminToken?: string | null;
      payoutId: string;
      status: PayoutStatus;
      providerReference?: string | null;
      failureReason?: string | null;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("./admin-gate.server");
    requireAdminToken(data.adminToken ?? null);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { canTransition } = await import("./service-billing.server");
    const { logAudit } = await import("./audit.server");

    const { data: row } = await supabaseAdmin
      .from("architect_payouts")
      .select("id, status")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row) throw new Error("পেআউট পাওয়া যায়নি");

    const from = row.status as PayoutStatus;
    if (!canTransition(from, data.status)) {
      throw new Error(`'${from}' থেকে '${data.status}' অবস্থায় যাওয়া যাবে না`);
    }
    const reference = (data.providerReference ?? "").trim();
    if (data.status === "paid" && !reference) {
      throw new Error("ব্যাংক/প্রোভাইডার নিশ্চিতকরণ রেফারেন্স ছাড়া পরিশোধিত চিহ্নিত করা যাবে না");
    }

    const patch: Record<string, unknown> = { status: data.status };
    if (reference) patch["provider_reference"] = reference;
    if (data.status === "ready") patch["requested_at"] = new Date().toISOString();
    if (data.status === "paid") patch["confirmed_at"] = new Date().toISOString();
    if (data.status === "failed") patch["failure_reason"] = data.failureReason ?? "unspecified";

    const { error } = await supabaseAdmin
      .from("architect_payouts")
      .update(patch as never)
      .eq("id", data.payoutId)
      .eq("status", from);
    if (error) throw new Error(error.message);

    await logAudit({
      action: "architect_payout_status_changed",
      entityType: "architect_payout",
      entityId: data.payoutId,
      actorLabel: "it_console",
      metadata: { from, to: data.status, reference: reference || null },
    });
    return { ok: true, from, to: data.status };
  });
