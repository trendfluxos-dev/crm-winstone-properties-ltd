import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, LogIn, MessageCircle, PhoneCall, Timer, Users } from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { MyCallLog } from "@/components/crm/MyCallLog";
import { MyProfileCard } from "@/components/crm/MyProfileCard";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import { QueueBoard } from "@/components/crm/QueueBoard";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { WhatsappInbox } from "@/components/crm/WhatsappInbox";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONNECTED_THRESHOLD_SECONDS, useSnapshot } from "@/lib/crm-data";
import { formatTalkTime } from "@/lib/crm-format";
import { useMyAccount, useSignOut } from "@/lib/session";

export const Route = createFileRoute("/desk")({
  head: () => ({
    meta: [
      { title: "আমার ডেস্ক — Winstone Connect" },
      {
        name: "description",
        content:
          "নিজের লিড তালিকা, কল রেকর্ড, হোয়াটসঅ্যাপ ইনবক্স আর নতুন লিড জমা দেওয়ার জায়গা — সব এক ডেস্কে।",
      },
      { property: "og:title", content: "আমার ডেস্ক — Winstone Connect" },
      {
        property: "og:description",
        content: "এক চাপে কল, হোয়াটসঅ্যাপ কথা আর নিজের লিড — Winstone Connect এজেন্ট ডেস্ক।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeskPage,
});

/** Live counters for the agent's own day. */
function DeskStats() {
  const { leads, calls, messages } = useSnapshot();

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayCalls = calls.filter((c) => new Date(c.created_at).toDateString() === today);
    const talk = todayCalls.reduce((sum, c) => sum + c.duration_seconds, 0);
    return {
      leads: leads.length,
      pending: leads.filter((l) => l.status === "pending").length,
      calls: todayCalls.length,
      connected: todayCalls.filter((c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS).length,
      talk,
      whatsapp: messages.filter((m) => new Date(m.created_at).toDateString() === today).length,
    };
  }, [leads, calls, messages]);

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<Users className="size-4" />}
        label="আমার লিড"
        value={String(stats.leads)}
        hint={`${stats.pending}টি এখনো বাকি`}
      />
      <Tile
        icon={<PhoneCall className="size-4" />}
        label="আজকের কল"
        value={String(stats.calls)}
        hint={`${stats.connected}টিতে কথা হয়েছে`}
      />
      <Tile
        icon={<Timer className="size-4" />}
        label="আজকের কথার সময়"
        value={formatTalkTime(stats.talk)}
        hint="সব কল মিলিয়ে"
      />
      <Tile
        icon={<MessageCircle className="size-4" />}
        label="আজকের হোয়াটসঅ্যাপ"
        value={String(stats.whatsapp)}
        hint="মেসেজ আদান-প্রদান"
      />
    </dl>
  );
}

function Tile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card-elevated p-3">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="tabular mt-1 text-xl font-bold">{value}</dd>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

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
