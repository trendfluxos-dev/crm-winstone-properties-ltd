import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { getMyAccount, registerMyAccount } from "@/lib/accounts.functions";
import { useAdminToken } from "@/lib/local-session";

export const SIGNUP_DRAFT_KEY = "winstone.signup.draft";

export type SignupDraft = { name: string; phone: string; requestedRole: "agent" | "coordinator" };

export function saveSignupDraft(draft: SignupDraft) {
  try {
    window.localStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* private mode */
  }
}

function readSignupDraft(): SignupDraft | null {
  try {
    const raw = window.localStorage.getItem(SIGNUP_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as SignupDraft) : null;
  } catch {
    return null;
  }
}

/**
 * Makes sure a signed-in user has a desk profile waiting for approval.
 * Safe to call repeatedly — the server ignores it once the profile exists.
 */
export async function ensureRegistered(fallbackName?: string) {
  const draft = readSignupDraft();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";
  const name = draft?.name || fallbackName || email.split("@")[0] || "New user";
  await registerMyAccount({
    data: {
      name,
      phone: draft?.phone || null,
      requestedRole: draft?.requestedRole ?? "agent",
    },
  });
  try {
    window.localStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export type Account = Awaited<ReturnType<typeof getMyAccount>>;

/** Who is using this device: PIN authority, coordinator, agent, or nobody. */
export function useMyAccount() {
  const token = useAdminToken();
  const query = useQuery({
    queryKey: ["my-account", token ? "pin" : "session"],
    queryFn: () => getMyAccount({ data: { adminToken: token } }),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  return {
    account: query.data ?? null,
    scope: query.data?.scope ?? "none",
    isPending: query.isPending,
  };
}

/** Clean sign-out: cancel queries, drop cached data, end the session. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
  };
}
