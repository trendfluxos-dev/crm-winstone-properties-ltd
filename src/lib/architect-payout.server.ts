/**
 * Provider-agnostic architect payout (disbursement) adapter.
 *
 * When no payout provider is configured the settlement flow still creates the
 * internal payable item with status PENDING — it just never claims a bank
 * transfer happened. A payout only becomes PAID on provider confirmation or an
 * explicit, audited IT Console confirmation with a bank reference.
 */

export type PayoutRequestResult = {
  provider: string;
  providerReference: string;
  /** Providers usually acknowledge first and confirm later. */
  status: "ready" | "paid" | "failed";
  failureReason: string | null;
};

export interface PayoutProvider {
  id: string;
  displayName: string;
  send(input: {
    payoutId: string;
    amount: number;
    currency: string;
    accountNumber: string;
    beneficiaryName: string;
    bankName: string;
    branchName: string | null;
    routingNumber: string | null;
  }): Promise<PayoutRequestResult>;
}

const REGISTRY: Record<string, PayoutProvider> = {};

export function getPayoutProvider(): PayoutProvider | null {
  const id = process.env["ARCHITECT_PAYOUT_PROVIDER"];
  if (!id) return null;
  return REGISTRY[id] ?? null;
}

export type PayoutProviderHealth = {
  configured: boolean;
  providerId: string | null;
  message: string;
};

export function payoutProviderHealth(): PayoutProviderHealth {
  const id = process.env["ARCHITECT_PAYOUT_PROVIDER"] ?? null;
  const adapter = id ? Boolean(REGISTRY[id]) : false;
  return {
    configured: adapter,
    providerId: id,
    message: !id
      ? "পেআউট প্রোভাইডার সেট করা নেই — ৳১,০০০ অভ্যন্তরীণ পেয়েবল হিসেবে অপেক্ষমাণ থাকবে"
      : adapter
        ? "পেআউট প্রোভাইডার সংযুক্ত"
        : `'${id}' নামে কোনো পেআউট অ্যাডাপ্টার নেই — সংযোগ সম্পূর্ণ হয়নি`,
  };
}
