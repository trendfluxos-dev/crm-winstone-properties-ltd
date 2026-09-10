import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, LogIn } from "lucide-react";

import { AppShell } from "@/components/crm/AppShell";
import { MyProfileCard } from "@/components/crm/MyProfileCard";
import { QueueBoard } from "@/components/crm/QueueBoard";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Button } from "@/components/ui/button";
import { useMyAccount, useSignOut } from "@/lib/session";

export const Route = createFileRoute("/desk")({
  head: () => ({
    meta: [
      { title: "My Desk — Winstone Connect" },
      {
        name: "description",
        content:
          "Your own lead queue, call history and profile settings inside the Winstone Connect tele-sales floor.",
      },
      { property: "og:title", content: "My Desk — Winstone Connect" },
      {
        property: "og:description",
        content: "Work your assigned leads with one-tap dialling and WhatsApp deep links.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeskPage,
});

function DeskPage() {
  const { account, scope, isPending } = useMyAccount();
  const signOut = useSignOut();

  if (isPending) {
    return (
      <AppShell>
        <SnapshotSkeleton />
      </AppShell>
    );
  }

  if (scope === "none") {
    return (
      <AppShell>
        <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
            {account?.signedIn ? <Clock className="size-7" /> : <LogIn className="size-7" />}
          </span>
          {account?.signedIn ? (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {account.approval === "rejected" ? "Access declined" : "Waiting for approval"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.approval === "rejected"
                    ? "A supervisor declined this account. Talk to your team lead if this looks wrong."
                    : "Your account is created. A supervisor in the IT Console or Executive HQ will open your desk shortly."}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void signOut()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Sign in to your desk</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Agents and coordinators use their own email and password.
                </p>
              </div>
              <Button asChild size="lg">
                <Link to="/auth" search={{ role: "agent", mode: "signin" }}>
                  <LogIn className="size-4" /> Sign in
                </Link>
              </Button>
            </>
          )}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <MyProfileCard />
        <QueueBoard
          title={scope === "agent" ? "My Leads" : "Floor Queue"}
          canSeeAllAgents={scope !== "agent"}
          showManualLog={scope !== "agent"}
        />
      </div>
    </AppShell>
  );
}
