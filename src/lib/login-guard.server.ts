/**
 * Brute-force guard and audit trail for the Android agent sign-in endpoint.
 *
 * Two production rules live here:
 *
 * 1. Every sign-in attempt — success or failure — leaves one immutable audit
 *    row. The row carries the outcome and safe request metadata only. The
 *    submitted identifier is stored as a short one-way fingerprint so repeated
 *    attacks on one desk are visible without ever writing a phone number,
 *    employee ID, email or password into the log.
 * 2. Too many failures from the same network or against the same fingerprint
 *    inside a short window are refused before the password is checked, so a
 *    stolen phone or a script cannot grind through passwords.
 *
 * State lives in `audit_logs`, not in worker memory: the server runs on
 * stateless workers, so an in-process counter would reset on every request.
 */
import { logAudit } from "@/lib/audit.server";
import { requestMeta } from "@/lib/request-meta.server";

/** Failures allowed from one IP, or against one identifier, per window. */
const MAX_FAILURES = 8;
const WINDOW_MINUTES = 15;

/** Short, non-reversible fingerprint of the submitted identifier. */
export async function identifierFingerprint(raw: string): Promise<string> {
  const normalised = raw.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export type LoginGuard = { blocked: boolean; retryAfterSeconds: number };

export async function checkLoginRate(fingerprint: string): Promise<LoginGuard> {
  const retryAfterSeconds = WINDOW_MINUTES * 60;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { ip } = requestMeta();

    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("metadata")
      .eq("action", "agent_login_failed")
      .gte("created_at", since)
      .limit(200);

    const rows = data ?? [];
    const matches = rows.filter((row) => {
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      return meta["fingerprint"] === fingerprint || (ip !== null && meta["ip"] === ip);
    });

    return { blocked: matches.length >= MAX_FAILURES, retryAfterSeconds };
  } catch {
    // A logging outage must never lock real agents out of their desk.
    return { blocked: false, retryAfterSeconds };
  }
}

/** One audit row per attempt. Never records the identifier or the password. */
export async function recordLoginAttempt(input: {
  outcome: "succeeded" | "failed";
  fingerprint: string;
  /** Only set once the password verified and the desk profile is known. */
  profileId?: string | null;
  /** Coarse reason, e.g. "bad_credentials", "not_approved", "rate_limited". */
  reason?: string;
}): Promise<void> {
  const meta = requestMeta();
  await logAudit({
    action: input.outcome === "succeeded" ? "agent_login_succeeded" : "agent_login_failed",
    entityType: "agent_session",
    entityId: input.profileId ?? null,
    actorProfileId: input.profileId ?? null,
    metadata: {
      fingerprint: input.fingerprint,
      reason: input.reason ?? null,
      ip: meta.ip,
      userAgent: meta.userAgent,
      platform: meta.platform,
    },
  });
}
