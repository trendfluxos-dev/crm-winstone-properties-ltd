import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function sha(input: string) {
  return createHash("sha256").update(input, "utf8").digest();
}

/**
 * Constant-time comparison of the submitted PIN against the master ADMIN_PIN
 * or the IT console PIN. Either one unlocks the boards on this device.
 */
export function pinMatches(input: string): boolean {
  const master = process.env["ADMIN_PIN"];
  const itConsole = process.env["IT_CONSOLE_PIN"];
  if (!master && !itConsole) throw new Error("ADMIN_PIN is not configured");
  const candidate = sha(input);
  let ok = false;
  for (const expected of [master, itConsole]) {
    if (expected && timingSafeEqual(candidate, sha(expected))) ok = true;
  }
  return ok;
}

/** Opaque token handed to the browser after a successful PIN unlock. */
export function mintAdminToken(): string {
  const secret = process.env["ADMIN_TOKEN_SECRET"];
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET is not configured");
  return createHmac("sha256", secret).update("winstone-admin:v1").digest("hex");
}

export function adminTokenValid(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    return timingSafeEqual(sha(token), sha(mintAdminToken()));
  } catch {
    return false;
  }
}

/** Throws unless the caller presents a valid admin token. */
export function requireAdminToken(token: string | null | undefined): void {
  if (!adminTokenValid(token)) throw new Error("Admin PIN required");
}
