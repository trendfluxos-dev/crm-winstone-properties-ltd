/**
 * WhatsApp hand-off helpers (client safe).
 *
 * WhatsApp refuses to be framed (`ERR_BLOCKED_BY_RESPONSE`), so every CRM
 * action must open WhatsApp OUTSIDE the app: native app on Android, new
 * browser tab elsewhere. Never an iframe / webview / same-frame navigation.
 */

/** Digits only, `+`/spaces/dashes removed. */
function digits(raw: string): string {
  return (raw ?? "").replace(/[^\d]/g, "");
}

/**
 * Bangladesh-first msisdn normalisation.
 * 01XXXXXXXXX -> 8801XXXXXXXXX, +8801… / 008801… / 8801… -> 8801XXXXXXXXX,
 * 1XXXXXXXXX -> 8801XXXXXXXXX. Returns null for malformed input.
 * Never produces a duplicated country code.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = digits(raw);
  if (!value) return null;

  while (value.startsWith("00")) value = value.slice(2);

  if (value.startsWith("880")) {
    value = `880${value.slice(3).replace(/^0+/, "")}`;
  } else if (value.startsWith("0")) {
    value = `880${value.slice(1)}`;
  } else if (/^1[3-9]\d{8}$/.test(value)) {
    value = `880${value}`;
  }

  if (/^8801[3-9]\d{8}$/.test(value)) return value;
  // Any other country code: accept a plausible international msisdn as-is.
  if (/^[1-9]\d{7,14}$/.test(value) && !value.startsWith("880")) return value;
  return null;
}

/** Supported external deep link. Optional prefilled text is URL encoded. */
export function whatsAppDeepLink(msisdn: string, text?: string | null): string {
  const base = `https://wa.me/${msisdn}`;
  const body = (text ?? "").trim();
  return body ? `${base}?text=${encodeURIComponent(body)}` : base;
}

export type WhatsAppOpenResult =
  { ok: true; url: string; msisdn: string } | { ok: false; reason: "invalid_number" | "blocked" };

/** Opens WhatsApp externally. Returns a result the UI can turn into a message. */
export function openWhatsApp(
  phone: string | null | undefined,
  text?: string | null,
): WhatsAppOpenResult {
  const msisdn = normalizeWhatsAppNumber(phone);
  if (!msisdn) return { ok: false, reason: "invalid_number" };
  const url = whatsAppDeepLink(msisdn, text);
  if (typeof window === "undefined") return { ok: true, url, msisdn };
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) return { ok: false, reason: "blocked" };
  return { ok: true, url, msisdn };
}
