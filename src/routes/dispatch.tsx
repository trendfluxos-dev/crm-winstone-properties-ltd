import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Send, Shuffle, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminGate } from "@/components/crm/AdminPinDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { CsvImportDialog } from "@/components/crm/CsvImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildAgentStats, snapshotQuery } from "@/lib/crm-data";
import { assignLeadsToAgent, autoDistributeLeads } from "@/lib/crm.functions";
import { formatTalkTime } from "@/lib/crm-format";
import { getAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/dispatch")({
  head: () => ({
    meta: [
      { title: "Lead Dispatcher — Winstone Connect" },
      {
        name: "description",
        content:
          "Coordinator desk: see each agent's lead load, push bulk batches and balance the floor in one click.",
      },
      { property: "og:title", content: "Lead Dispatcher — Winstone Connect" },
      {
        property: "og:description",
        content: "Assign, balance and monitor lead distribution across your tele-sales floor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  component: DispatchPage,
});

function DispatchPage() {
  return (
    <AppShell>
      <AdminGate
        locked={(openPin) => (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <Users className="size-7" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-bold">Team Coordinator Desk</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Lead dispatching, team load and AI distribution. Master PIN required.
              </p>
            </div>
            <Button size="lg" onClick={openPin}>
              <Lock className="size-4" /> Enter PIN
            </Button>
          </div>
        )}
      >
        <Dispatcher />
      </AdminGate>
    </AppShell>
  );
}

function Dispatcher() {
  const {
    data: { profiles, leads, calls, messages },
  } = useSuspenseQuery(snapshotQuery);
  const queryClient = useQueryClient();
  const assign = useServerFn(assignLeadsToAgent);
  const distribute = useServerFn(autoDistributeLeads);

  const stats = useMemo(
    () => buildAgentStats(profiles, leads, calls, messages),
    [profiles, leads, calls, messages],
  );
  const agents = stats.map((s) => s.profile);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [count, setCount] = useState("20");

  const unassigned = leads.filter((l) => l.assigned_to === null).length;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });

  const push = useMutation({
    mutationFn: () =>
      assign({
        data: {
          adminToken: getAdminToken() ?? "",
          agentId,
          count: Math.max(1, Number(count) || 1),
          onlyUnassigned: true,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.assigned
          ? `${result.assigned} leads pushed to ${agents.find((a) => a.id === agentId)?.name}`
          : "No unassigned pending leads left",
      );
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const balance = useMutation({
    mutationFn: () => distribute({ data: { adminToken: getAdminToken() ?? "" } }),
    onSuccess: (result) => {
      toast.success(
        result.assigned
          ? `${result.assigned} leads spread across ${result.agents} agents`
          : "Every lead already has an owner",
      );
      void refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Lead Dispatcher</h1>
          <p className="text-sm text-muted-foreground">
            {leads.length} leads in the pipeline · {unassigned} waiting for an owner
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog />
          <CopilotDrawer />
        </div>
      </div>

      <section className="card-elevated p-4">
        <h2 className="text-sm font-semibold">Bulk push</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Choose agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name}
                  {agent.employee_id ? ` · ${agent.employee_id}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={count}
            onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))}
            className="w-24"
            inputMode="numeric"
            placeholder="20"
          />
          <Button onClick={() => push.mutate()} disabled={!agentId || push.isPending}>
            {push.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Push leads
          </Button>
          <Button variant="secondary" onClick={() => balance.mutate()} disabled={balance.isPending}>
            {balance.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shuffle className="size-4" />
            )}
            Balance all {unassigned > 0 ? `(${unassigned})` : ""}
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Team load</h2>
        <div className="overflow-x-auto card-elevated">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-right">Assigned</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-right">Connected</th>
                <th className="px-4 py-2 text-right">Talk time</th>
                <th className="px-4 py-2 text-right">Won</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => {
                const pending = leads.filter(
                  (l) => l.assigned_to === row.profile.id && l.status === "pending",
                ).length;
                return (
                  <tr key={row.profile.id} className="border-t border-border/70">
                    <td className="px-4 py-2">
                      <span className="font-medium">{row.profile.name}</span>
                      {row.profile.employee_id && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {row.profile.employee_id}
                        </span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{row.assigned}</td>
                    <td className="tabular px-4 py-2 text-right">{pending}</td>
                    <td className="tabular px-4 py-2 text-right">{row.connected}</td>
                    <td className="tabular px-4 py-2 text-right">
                      {formatTalkTime(row.talkSeconds)}
                    </td>
                    <td className="tabular px-4 py-2 text-right">{row.closedWon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
