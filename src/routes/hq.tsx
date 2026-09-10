import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, PhoneCall, Shuffle, Timer, TrendingUp, Users } from "lucide-react";
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
import { AgentRadar } from "@/components/crm/AgentRadar";
import { Leaderboard } from "@/components/crm/Leaderboard";
import { LeadDossier } from "@/components/crm/LeadDossier";
import { ManualIngestDialog } from "@/components/crm/ManualIngestDialog";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive HQ — Tele-Sales CRM OS" },
      {
        name: "description",
        content:
          "Live agent radar, call leaderboard and AI call intelligence for enterprise tele-sales teams.",
      },
      { property: "og:title", content: "Executive HQ — Tele-Sales CRM OS" },
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
  component: ExecutiveHq,
});

function ExecutiveHq() {
  const {
    data: { profiles, leads, calls, messages },
  } = useSuspenseQuery(snapshotQuery);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
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

  return (
    <AppShell>
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Executive HQ</h1>
            <p className="text-sm text-muted-foreground">
              Every dial, recording and WhatsApp touch across the floor, updating live.
            </p>
          </div>
          <div className="flex gap-2">
            <AdminGate
              locked={(openPin) => (
                <Button variant="secondary" size="sm" onClick={openPin}>
                  <Lock className="size-4" /> Control board
                </Button>
              )}
            >
              <ManualIngestDialog leads={leads} agents={agents} />
              <Button size="sm" onClick={() => balance.mutate()} disabled={balance.isPending}>
                {balance.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Shuffle className="size-4" />
                )}
                Balance {unassigned > 0 ? `${unassigned} leads` : "leads"}
              </Button>
            </AdminGate>
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

        <AgentRadar agents={agents} calls={calls} />

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
          <div className="h-72 rounded-xl border border-border bg-card p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.32 0.02 240)" vertical={false} />
                <XAxis dataKey="name" stroke="oklch(0.7 0.02 240)" fontSize={12} />
                <YAxis stroke="oklch(0.7 0.02 240)" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.21 0.02 250)",
                    border: "1px solid oklch(0.32 0.02 240)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="connected" fill="oklch(0.75 0.15 195)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="talkMinutes" fill="oklch(0.78 0.18 130)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <Leaderboard stats={stats} />

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
                    className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40"
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
    </AppShell>
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
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="tabular mt-2 font-display text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
