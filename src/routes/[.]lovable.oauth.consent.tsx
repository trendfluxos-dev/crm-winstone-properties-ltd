import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type OauthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string;
  redirect_to?: string;
};

function oauth(): OauthNamespace {
  return (supabase.auth as unknown as { oauth: OauthNamespace }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the session lives in localStorage, absent during SSR.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Missing authorization_id");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return { signedIn: false as const, details: null };

    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return { signedIn: true as const, details: data };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="text-sm text-destructive">
        Could not load this connection request: {String((error as Error)?.message ?? error)}
      </p>
    </Shell>
  ),
  head: () => ({
    meta: [
      { title: "Approve access · Winstone Connect" },
      { name: "description", content: "Approve or deny an AI assistant's access to the Winstone Connect CRM." },
      { property: "og:title", content: "Approve access · Winstone Connect" },
      {
        property: "og:description",
        content: "Approve or deny an AI assistant's access to the Winstone Connect CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="card-elevated w-full max-w-md space-y-4 p-6">{children}</div>
    </main>
  );
}

function Consent() {
  const state = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!state.signedIn) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Sign in to continue</h1>
        <p className="text-sm text-muted-foreground">
          Sign in with your Google account so we know who is connecting to the CRM.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error: signInError } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: window.location.href },
            });
            if (signInError) {
              setBusy(false);
              setError(signInError.message);
            }
          }}
        >
          Continue with Google
        </Button>
      </Shell>
    );
  }

  const clientName = state.details?.client?.name ?? "an assistant";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: decisionError } = approve
      ? await oauth().approveAuthorization(authorization_id)
      : await oauth().denyAuthorization(authorization_id);
    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("The sign-in service did not return a return address.");
      return;
    }
    window.location.href = target;
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold">Connect {clientName} to Winstone Connect</h1>
      <p className="text-sm text-muted-foreground">
        {clientName} will be able to read leads, call and WhatsApp history and floor activity, and add new leads —
        acting as you. Only approved email addresses can actually use these tools.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
          Approve
        </Button>
        <Button className="flex-1" variant="outline" disabled={busy} onClick={() => decide(false)}>
          Deny
        </Button>
      </div>
    </Shell>
  );
}
