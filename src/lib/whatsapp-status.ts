/**
 * Client-safe labels for a stored WhatsApp message state.
 *
 * `logged` is the honest state for a message that travelled through the
 * agent's own WhatsApp: the CRM knows it was written, not that Meta delivered
 * it. Only Meta webhook callbacks produce sent / delivered / read / failed.
 */
export type WhatsappDeliveryStatus =
  | "logged"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

const LABELS: Record<WhatsappDeliveryStatus, string> = {
  logged: "সংরক্ষিত (নিজের হোয়াটসঅ্যাপ)",
  queued: "অপেক্ষায়",
  sent: "পাঠানো হয়েছে",
  delivered: "পৌঁছেছে",
  read: "পড়া হয়েছে",
  failed: "পৌঁছায়নি",
  unknown: "অবস্থা জানা নেই",
};

/** ✓ = sent, ✓✓ = delivered, ✓✓ (blue) = read, ! = failed. */
const TICKS: Record<WhatsappDeliveryStatus, string> = {
  logged: "•",
  queued: "◌",
  sent: "✓",
  delivered: "✓✓",
  read: "✓✓",
  failed: "!",
  unknown: "•",
};

export function whatsappStatus(raw: string | null | undefined): WhatsappDeliveryStatus {
  const value = (raw ?? "").toLowerCase();
  return value in LABELS ? (value as WhatsappDeliveryStatus) : "unknown";
}

export function whatsappStatusLabel(raw: string | null | undefined): string {
  return LABELS[whatsappStatus(raw)];
}

export function whatsappStatusTicks(raw: string | null | undefined): string {
  return TICKS[whatsappStatus(raw)];
}

export function whatsappStatusTone(raw: string | null | undefined): string {
  const status = whatsappStatus(raw);
  if (status === "read") return "text-sky-600 dark:text-sky-400";
  if (status === "failed") return "text-destructive";
  if (status === "delivered" || status === "sent") return "text-whatsapp";
  return "text-muted-foreground";
}
