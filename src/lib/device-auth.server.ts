/**
 * Per-device authentication for the Winstone Connect Android app.
 *
 * The distributed APK no longer carries the privileged shared INGEST_SECRET.
 * Instead the phone signs in once with the agent's CRM email + password and
 * receives a long random device token, bound to that agent profile and stored
 * only as a SHA-256 hash in `agent_devices`. Every later phone request carries
 * `x-device-token`; the server resolves the agent from the token, so a phone can
 * never act as another agent.
 *
 * INGEST_SECRET still authenticates trusted server-to-server callers (website
 * lead webhooks, cron sweeps, the ingest tester) — it is simply not shipped to
 * end-user devices any more.
 */
import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AgentDevice = Database["public"]["Tables"]["agent_devices"]["Row"];

export type ApiCaller =
  | { kind: "device"; device: AgentDevice; profile: Profile }
  | { kind: "server" }
  | { kind: "none" };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Trusted server-to-server secret (never shipped inside the APK). */
export function serverSecretValid(request: Request): boolean {
  const secret = process.env["INGEST_SECRET"];
  const provided = request.headers.get("x-ingest-secret") ?? "";
  if (!secret) return false;
  return constantTimeEqual(secret, provided);
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function newDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Issues (or re-issues) a device token for one agent profile. */
export async function issueDeviceToken(input: {
  profileId: string;
  deviceLabel?: string | null;
  appVersion?: string | null;
  platform?: string;
  /** Optional inventory the phone reports at binding time. */
  deviceUid?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  androidVersion?: string | null;
  phoneNumber?: string | null;
  recordingCapable?: boolean | null;
  recordingNote?: string | null;
}): Promise<{ token: string; deviceId: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const token = newDeviceToken();
  const tokenHash = await hashToken(token);

  const { data, error } = await supabaseAdmin
    .from("agent_devices")
    .insert({
      profile_id: input.profileId,
      token_hash: tokenHash,
      device_label: input.deviceLabel ?? null,
      app_version: input.appVersion ?? null,
      platform: input.platform ?? "android",
      device_uid: input.deviceUid ?? null,
      manufacturer: input.manufacturer ?? null,
      model: input.model ?? null,
      android_version: input.androidVersion ?? null,
      phone_number: input.phoneNumber ?? null,
      recording_capable: input.recordingCapable ?? null,
      recording_tested: input.recordingCapable != null,
      recording_note: input.recordingNote ?? null,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not register device");

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "device_registered",
    entityType: "agent_device",
    entityId: data.id,
    actorProfileId: input.profileId,
    metadata: {
      platform: input.platform ?? "android",
      appVersion: input.appVersion ?? null,
      deviceLabel: input.deviceLabel ?? null,
    },
  });

  const { recordSyncEvent } = await import("@/lib/call-jobs.server");
  await recordSyncEvent({
    agentId: input.profileId,
    deviceId: data.id,
    eventType: "device_bound",
    entityType: "agent_device",
    entityId: data.id,
    payload: {
      model: input.model ?? null,
      android_version: input.androidVersion ?? null,
      recording_capable: input.recordingCapable ?? null,
    },
  });

  return { token, deviceId: data.id };
}

/**
 * Resolves the caller of a public phone endpoint. Device tokens win; the
 * server secret is accepted for trusted back-office callers only.
 */
export async function resolveApiCaller(request: Request): Promise<ApiCaller> {
  const token = request.headers.get("x-device-token")?.trim();
  if (token && token.length >= 32) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await hashToken(token);
    const { data: device } = await supabaseAdmin
      .from("agent_devices")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (device) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", device.profile_id)
        .maybeSingle();
      if (
        profile &&
        profile.is_active &&
        (profile.approval_status ?? "pending") === "approved"
      ) {
        void supabaseAdmin
          .from("agent_devices")
          .update({ last_seen_at: new Date().toISOString() })
          .eq("id", device.id);
        return { kind: "device", device, profile };
      }
      return { kind: "none" };
    }
    return { kind: "none" };
  }

  if (serverSecretValid(request)) return { kind: "server" };
  return { kind: "none" };
}

/** 401 helper: returns the response to send when a caller is not authorised. */
export function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}
