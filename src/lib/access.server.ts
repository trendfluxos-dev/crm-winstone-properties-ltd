import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

import type { Database } from "@/integrations/supabase/types";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Scope = "authority" | "coordinator" | "agent" | "none";

export type Caller = {
  /** authority = HQ / IT master PIN, coordinator = approved team leader account. */
  scope: Scope;
  profile: Profile | null;
  userId: string | null;
  /** Present when a signed-in account exists but is not approved yet. */
  approval: "pending" | "approved" | "rejected" | null;
};

const ANON: Caller = { scope: "none", profile: null, userId: null, approval: null };

function isNewKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** Reads the Supabase user id from the bearer token on the current request, if any. */
async function userIdFromRequest(): Promise<string | null> {
  const request = getRequest();
  const header = request?.headers?.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (token.split(".").length !== 3) return null;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;

  const client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });

  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return String(data.claims.sub);
}

/**
 * Single resolver for both ways in: the master/IT PIN token (authority) and a
 * signed-in agent or coordinator account. Everything else is anonymous.
 */
export async function resolveCaller(adminToken?: string | null): Promise<Caller> {
  const { adminTokenValid } = await import("@/lib/admin-gate.server");
  if (adminTokenValid(adminToken ?? null)) {
    return { scope: "authority", profile: null, userId: null, approval: "approved" };
  }

  const userId = await userIdFromRequest();
  if (!userId) return ANON;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select(PROFILE_SAFE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) return { ...ANON, userId };

  const approval = (profile.approval_status ?? "pending") as Caller["approval"];
  if (approval !== "approved" || !profile.is_active) {
    return { scope: "none", profile, userId, approval };
  }

  return {
    scope: profile.role === "admin" ? "authority" : profile.role === "team_leader" ? "coordinator" : "agent",
    profile,
    userId,
    approval,
  };
}

/** Authority or coordinator may dispatch leads. */
export function canDispatch(caller: Caller) {
  return caller.scope === "authority" || caller.scope === "coordinator";
}

export function requireDispatch(caller: Caller) {
  if (!canDispatch(caller)) throw new Error("Coordinator access required");
}

export function requireAuthority(caller: Caller) {
  if (caller.scope !== "authority") throw new Error("Master PIN required");
}
