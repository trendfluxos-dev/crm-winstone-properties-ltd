import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, PhoneCall, ShieldCheck, Shuffle, Timer, TrendingUp, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminGate } from "@/components/crm/AdminPinDialog";
import { AgentDossier } from "@/components/crm/AgentDossier";
import { CsvImportDialog } from "@/components/crm/CsvImportDialog";
import { AgentRadar } from "@/components/crm/AgentRadar";
import { Leaderboard } from "@/components/crm/Leaderboard";
import { LeadDossier } from "@/components/crm/LeadDossier";
import { ManualIngestDialog } from "@/components/crm/ManualIngestDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import {
  buildAgentStats,
  buildTimeline,
  CONNECTED_THRESHOLD_SECONDS,
  snapshotQuery,
} from "@/lib/crm-data";
import { autoDistributeLeads } from "@/lib/crm.functions";
import { formatTalkTime } from "@/lib/crm-format";
import { getAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/hq")({
  head: () => ({
    meta: [
      { title: "Control Board — Tele-Sales CRM OS" },
      {
        name: "description",
        content:
          "Live agent radar, call leaderboard and AI call intelligence for enterprise tele-sales teams.",
      },
      { property: "og:title", content: "Control Board — Tele-Sales CRM OS" },
      {
        property: "og:description",
        content:
          "Track live calls, talk time, verified recordings and AI call summaries in one command center.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(snapshotQuery);
  },
  pendingComponent: () => (
    <AppShell>
      <SnapshotSkeleton />
    </AppShell>
  ),
  component: ControlBoardPage,
});

function ControlBoardPage() {
  return (
    <AppShell>
      <AdminGate
        locked={(openPin) => (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <ShieldCheck className="size-7" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">Authority Control Board</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Live radar, leaderboard, call audits and lead distribution. Master PIN required.
              </p>
            </div>
            <Button size="lg" onClick={openPin}>
              <Lock className="size-4" /> Enter PIN
            </Button>
          </div>
        )}
      >
        <ControlBoard />
      </AdminGate>
    </AppShell>
  );
}

function ControlBoard() {
  const {
    data: { profiles, leads, calls, messages },
  } = useSuspenseQuery(snapshotQuery);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [openAgentId, setOpenAgentId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const distribute = useServerFn(autoDistributeLeads);

  const agents = useMemo(
    () => profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [profiles],
  );
  const stats = useMemo(
    () => buildAgentStats(profiles, leads, calls, messages),
    [profiles, leads, calls, messages],
  );

  const connected = calls.filter((c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS).length;
  const talkSeconds = calls.reduce((sum, c) => sum + c.duration_seconds, 0);
  const unassigned = leads.filter((l) => l.assigned_to === null).length;

  const chartData = stats.map((row) => ({
    name: row.profile.name.split(" ")[0] ?? row.profile.name,
    connected: row.connected,
    talkMinutes: Math.round(row.talkSeconds / 60),
  }));

  const balance = useMutation({
    mutationFn: () => distribute({ data: { adminToken: getAdminToken() ?? "" } }),
    onSuccess: (result) => {
      toast.success(
        result.assigned > 0
          ? `${result.assigned} leads spread across ${result.agents} agents`
          : "Every lead is already assigned",
      );
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;
  const openAgent = profiles.find((p) => p.id === openAgentId) ?? null;

  return (
    <>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Control Board</h1>
            <p className="text-sm text-muted-foreground">
              Every dial, recording and WhatsApp touch across the floor, updating live.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CsvImportDialog />
            <ManualIngestDialog leads={leads} agents={agents} />
            <Button size="sm" onClick={() => balance.mutate()} disabled={balance.isPending}>
              {balance.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Shuffle className="size-4" />
              )}
              Auto distribute {unassigned > 0 ? `${unassigned} leads` : "leads"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={<PhoneCall className="size-4" />}
            label="Total dials"
            value={String(calls.length)}
            hint={`${connected} connected over ${CONNECTED_THRESHOLD_SECONDS}s`}
          />
          <StatTile
            icon={<Timer className="size-4" />}
            label="Floor talk time"
            value={formatTalkTime(talkSeconds)}
            hint="Across all synced recordings"
          />
          <StatTile
            icon={<Users className="size-4" />}
            label="Active leads"
            value={String(leads.filter((l) => l.status !== "closed").length)}
            hint={`${unassigned} waiting for an owner`}
          />
          <StatTile
            icon={<TrendingUp className="size-4" />}
            label="Deals won"
            value={String(
              leads.filter((l) => l.status === "closed" && l.outcome_category === "deal_won")
                .length,
            )}
            hint={`${messages.length} WhatsApp messages logged`}
          />
        </div>

        <AgentRadar agents={agents} calls={calls} onSelectAgent={setOpenAgentId} />

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Connected calls vs talk minutes</h2>
              <p className="text-sm text-muted-foreground">Per agent, all recorded activity</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-primary" /> Connected calls
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-live" /> Talk minutes
              </span>
            </div>
          </div>
          <div className="card-elevated h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                    boxShadow: "var(--shadow-card-hover)",
                  }}
                />
                <Bar dataKey="connected" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="talkMinutes" fill="var(--live)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <Leaderboard stats={stats} onSelectAgent={setOpenAgentId} />

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Latest verified conversations</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {calls
              .filter((c) => c.ai_summary)
              .slice(0, 6)
              .map((call) => {
                const lead = leads.find((l) => l.id === call.lead_id);
                const agent = profiles.find((p) => p.id === call.agent_id);
                return (
                  <button
                    key={call.id}
                    onClick={() => lead && setOpenLeadId(lead.id)}
                    className="card-elevated p-4 text-left transition-colors hover:border-primary/40"
                  >
                    <p className="font-medium">{lead?.name ?? "Unknown lead"}</p>
                    <p className="text-xs text-muted-foreground">
                      {agent?.name} · {call.sentiment ?? "unrated"}
                    </p>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                      {call.ai_summary}
                    </p>
                  </button>
                );
              })}
          </div>
        </section>
      </div>

      <LeadDossier
        lead={openLead}
        agents={profiles}
        timeline={openLead ? buildTimeline(calls, messages, openLead.id) : []}
        open={openLeadId !== null}
        onOpenChange={(next) => !next && setOpenLeadId(null)}
      />
      <AgentDossier
        agent={openAgent}
        leads={leads}
        calls={calls}
        messages={messages}
        open={openAgentId !== null}
        onOpenChange={(next) => !next && setOpenAgentId(null)}
      />
    </>
  );
}

function StatTile({
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
    <div className="card-elevated relative overflow-hidden p-5">
      <span className="absolute -right-6 -top-6 size-20 rounded-full bg-primary/10 blur-2xl" />
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        {label}
      </p>
      <p className="tabular mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <Sparkline seed={value.length + label.length} />
    </div>
  );
}

/** Tiny decorative sparkline; deterministic per tile so it doesn't jitter on refetch. */
function Sparkline({ seed }: { seed: number }) {
  const points = Array.from({ length: 12 }, (_, i) => {
    const y = 18 - ((Math.sin(i * 0.9 + seed) + 1) * 6 + (i / 11) * 4);
    return `${(i / 11) * 100},${y}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 100 20" className="mt-3 h-5 w-full text-primary/60" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
