/**
 * Shared constants for the WINSTONE CRM monthly service bill.
 *
 * Client-safe: no secrets, no database access. The amounts live here so the
 * Executive HQ card, the IT Console control panel and the server settlement
 * logic can never disagree about what a month costs or how it is split.
 */

export const SERVICE_CURRENCY = "BDT";

/** Monthly service amount. Overridable server-side via SERVICE_MONTHLY_AMOUNT. */
export const SERVICE_MONTHLY_AMOUNT = 4000;

/** Internal allocation of a verified payment. Must sum to the service amount. */
export const ALLOCATION_SYSTEM = 3000;
export const ALLOCATION_ARCHITECT = 1000;

/** Billing happens on the 15th of every month, Asia/Dhaka. */
export const BILLING_DAY = 15;

/** Days after the billing date before an unpaid invoice counts as overdue. */
export const OVERDUE_GRACE_DAYS = 7;

export type InvoiceStatus = "paid" | "due" | "overdue" | "failed" | "pending";

export type PayoutStatus = "pending" | "approved" | "ready" | "paid" | "failed" | "cancelled";

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "পরিশোধিত",
  due: "বকেয়া",
  overdue: "মেয়াদোত্তীর্ণ",
  failed: "ব্যর্থ",
  pending: "যাচাই চলছে",
};

export const PAYOUT_STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: "অপেক্ষমাণ",
  approved: "অনুমোদিত",
  ready: "পাঠানোর জন্য প্রস্তুত",
  paid: "পরিশোধিত",
  failed: "ব্যর্থ",
  cancelled: "বাতিল",
};

export function formatBdt(amount: number): string {
  return `৳${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
