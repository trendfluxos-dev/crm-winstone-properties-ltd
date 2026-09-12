import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock, LogIn, MessageCircle, PhoneCall, Timer, Users } from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { MyCallLog } from "@/components/crm/MyCallLog";
import { MyPhoneSetup } from "@/components/crm/MyPhoneSetup";
import { MyProfileCard } from "@/components/crm/MyProfileCard";
import { FollowUpCalendar } from "@/components/crm/FollowUpCalendar";
import { MyReports } from "@/components/crm/MyReports";
import { PostCallReportGate } from "@/components/crm/PostCallReportGate";
import { NewLeadDialog } from "@/components/crm/NewLeadDialog";
import { OpenLeadsCard } from "@/components/crm/OpenLeadsCard";
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
                  {account.approval === "rejected" ? "প্রবেশ বাতিল" : "অনুমোদনের অপেক্ষায়"}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {account.approval === "rejected"
                    ? "একজন সুপারভাইজার এই অ্যাকাউন্ট বাতিল করেছেন। ভুল মনে হলে টিম লিডের সঙ্গে কথা বলুন।"
                    : "আপনার অ্যাকাউন্ট তৈরি হয়েছে। আইটি কনসোল বা এক্সিকিউটিভ এইচকিউ থেকে শীঘ্রই ডেস্ক খুলে দেওয়া হবে।"}
                </p>
              </div>
              <Button variant="secondary" onClick={() => void signOut()}>
                সাইন আউট
              </Button>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">নিজের ডেস্কে সাইন ইন করুন</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  এজেন্ট ও কোঅর্ডিনেটর নিজের ইমেইল ও পাসওয়ার্ড ব্যবহার করবেন।
                </p>
              </div>
              <Button asChild size="lg">
                <Link to="/auth" search={{ role: "agent", mode: "signin" }}>
                  <LogIn className="size-4" /> সাইন ইন
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
        <PostCallReportGate />
        <MyProfileCard />
        <MyPhoneSetup />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">আমার ডেস্ক</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              নিজের লিড, কল, হোয়াটসঅ্যাপ কথা আর নতুন লিড — সব এক জায়গায়।
            </p>
          </div>
          <NewLeadDialog />
        </div>

        <DeskStats />

        <Tabs defaultValue="leads" className="space-y-4">
          <TabsList className="flex w-full flex-wrap">
            <TabsTrigger value="leads">লিড তালিকা</TabsTrigger>
            <TabsTrigger value="calls">কল রেকর্ড</TabsTrigger>
            <TabsTrigger value="whatsapp">হোয়াটসঅ্যাপ</TabsTrigger>
            <TabsTrigger value="calendar">ফলো-আপ</TabsTrigger>
            <TabsTrigger value="reports">আমার রিপোর্ট</TabsTrigger>
          </TabsList>
          <TabsContent value="leads" className="space-y-4">
            <OpenLeadsCard />
            <QueueBoard
              title={scope === "agent" ? "আমার লিড" : "ফ্লোর কিউ"}
              canSeeAllAgents={scope !== "agent"}
              showManualLog={scope !== "agent"}
            />
          </TabsContent>
          <TabsContent value="calls">
            <MyCallLog />
          </TabsContent>
          <TabsContent value="whatsapp">
            <WhatsappInbox />
          </TabsContent>
          <TabsContent value="calendar">
            <FollowUpCalendar />
          </TabsContent>
          <TabsContent value="reports">
            <MyReports />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
