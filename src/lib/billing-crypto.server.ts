import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Bank account numbers for the architect payout profile are stored encrypted
 * at rest (AES-256-GCM) and only ever leave the server masked. Nothing here
 * touches card numbers, CVV, OTP or bank passwords — those are never stored.
 */

function key(): Buffer {
  const secret = process.env["BILLING_ENCRYPTION_KEY"] ?? process.env["ADMIN_TOKEN_SECRET"];
  if (!secret) throw new Error("BILLING_ENCRYPTION_KEY is not configured");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecretValue(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecretValue(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unreadable stored value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** Last four digits only: 1234567890123 -> ••••••••• 0123 */
export function maskAccountNumber(plain: string): string {
  const digits = plain.replace(/\s+/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function encryptionConfigured(): boolean {
  return Boolean(process.env["BILLING_ENCRYPTION_KEY"] ?? process.env["ADMIN_TOKEN_SECRET"]);
}
