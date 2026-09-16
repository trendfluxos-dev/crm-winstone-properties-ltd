/**
 * Provider-agnostic card payment adapter.
 *
 * No Bangladesh card gateway is connected in this workspace. Rather than
 * pretending one exists, the registry below is empty and every caller gets an
 * explicit "not configured" state. Connecting a gateway later means adding one
 * adapter object here and setting the environment values — nothing else in the
 * billing state machine changes.
 */

export type ProviderCheckout = {
  provider: string;
  reference: string;
  /** Hosted checkout the browser should open, when the provider offers one. */
  checkoutUrl: string | null;
};

export type VerifiedPayment = {
  provider: string;
  providerTxnId: string;
  amount: number;
  currency: string;
  /** Invoice reference the provider echoed back, when it carries one. */
  invoiceReference: string | null;
  succeeded: boolean;
  failureReason: string | null;
  payload: Record<string, unknown>;
};

export interface PaymentProvider {
  id: string;
  displayName: string;
  /** Opens/creates a payment for one invoice. */
  createCheckout(input: {
    invoiceReference: string;
    amount: number;
    currency: string;
  }): Promise<ProviderCheckout>;
  /** Verifies a raw webhook body. Returns null when the signature fails. */
  verifyWebhook(request: Request, rawBody: string): Promise<VerifiedPayment | null>;
}

/** Adapters are registered here once a real gateway contract is available. */
const REGISTRY: Record<string, PaymentProvider> = {};

export function getPaymentProvider(): PaymentProvider | null {
  const id = process.env["BILLING_PAYMENT_PROVIDER"];
  if (!id) return null;
  return REGISTRY[id] ?? null;
}

export type ProviderHealth = {
  configured: boolean;
  providerId: string | null;
  adapterAvailable: boolean;
  webhookSecretConfigured: boolean;
  message: string;
};

export function paymentProviderHealth(): ProviderHealth {
  const id = process.env["BILLING_PAYMENT_PROVIDER"] ?? null;
  const adapter = id ? Boolean(REGISTRY[id]) : false;
  const webhookSecretConfigured = Boolean(process.env["BILLING_WEBHOOK_SECRET"]);
  return {
    configured: Boolean(id) && adapter,
    providerId: id,
    adapterAvailable: adapter,
    webhookSecretConfigured,
    message: !id
      ? "কার্ড পেমেন্ট প্রোভাইডার সেট করা নেই — এখন শুধু ব্যাংক/ম্যানুয়াল যাচাই চলবে"
      : !adapter
        ? `'${id}' নামে কোনো অ্যাডাপ্টার নেই — সংযোগ সম্পূর্ণ হয়নি`
        : webhookSecretConfigured
          ? "প্রোভাইডার সংযুক্ত"
          : "প্রোভাইডার সেট আছে, কিন্তু ওয়েবহুক সিক্রেট নেই",
  };
}
