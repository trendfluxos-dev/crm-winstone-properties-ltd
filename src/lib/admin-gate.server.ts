import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function sha(input: string) {
  return createHash("sha256").update(input, "utf8").digest();
}

/**
 * Two unlock scopes come out of the same PIN:
 *   - "full"  : IT Console. May read AND change system state.
 *   - "hq"    : Executive HQ. Read-only — management visibility, no coordinator
 *               or IT mutations, enforced on the server (see requireWrite).
 * The surface the browser unlocked from decides which token is minted, so an HQ
 * session cannot be replayed against a mutating endpoint.
 */
export type AdminScope = "full" | "hq";

const SCOPE_MESSAGE: Record<AdminScope, string> = {
  full: "winstone-admin:v1",
  hq: "winstone-hq:v1",
};

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
export function mintAdminToken(scope: AdminScope = "full"): string {
  const secret = process.env["ADMIN_TOKEN_SECRET"];
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET is not configured");
  return createHmac("sha256", secret).update(SCOPE_MESSAGE[scope]).digest("hex");
}

/** Which scope this token carries, or null when it is not one of ours. */
export function adminTokenScope(token: string | null | undefined): AdminScope | null {
  if (!token) return null;
  try {
    for (const scope of ["full", "hq"] as AdminScope[]) {
      if (timingSafeEqual(sha(token), sha(mintAdminToken(scope)))) return scope;
    }
  } catch {
    return null;
  }
  return null;
}

export function adminTokenValid(token: string | null | undefined): boolean {
  return adminTokenScope(token) !== null;
}

/** Throws unless the caller presents a full (IT Console) admin token. */
export function requireAdminToken(token: string | null | undefined): void {
  if (adminTokenScope(token) !== "full") throw new Error("Admin PIN required");
}
