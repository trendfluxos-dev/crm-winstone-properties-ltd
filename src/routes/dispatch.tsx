import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock, Send, Shuffle, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { QueueBoard } from "@/components/crm/QueueBoard";
import { AssignmentHistory } from "@/components/crm/AssignmentHistory";
import { CallOpsPanel } from "@/components/crm/CallOpsPanel";
import { SelfClaimsFeed } from "@/components/crm/SelfClaimsFeed";
import { RoleGate } from "@/components/crm/RoleGate";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { CommandAgentPanel } from "@/components/crm/CommandAgentPanel";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { CsvImportDialog } from "@/components/crm/CsvImportDialog";
import { LeadDatabasePanel } from "@/components/crm/LeadDatabasePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildAgentStats, useSnapshot } from "@/lib/crm-data";
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
      <RoleGate
        allow={["authority", "coordinator"]}
        icon={<Users className="size-7" />}
        title="Team Coordinator Desk"
        description="Lead dispatching, team load and the full floor queue. Coordinator account or master PIN."
      >
        <Dispatcher />
      </RoleGate>
    </AppShell>
  );
}

function Dispatcher() {
  const { profiles, leads, calls, messages } = useSnapshot();
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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Lead Dispatcher</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
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
            <SelectTrigger className="w-full sm:w-[240px]">
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
            className="w-20 sm:w-24"
            inputMode="numeric"
            placeholder="20"
          />
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => push.mutate()}
            disabled={!agentId || push.isPending}
          >
            {push.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Push leads
          </Button>
          <Button
            variant="secondary"
            className="flex-1 sm:flex-none"
            onClick={() => balance.mutate()}
            disabled={balance.isPending}
          >
            {balance.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Shuffle className="size-4" />
            )}
            Balance all {unassigned > 0 ? `(${unassigned})` : ""}
          </Button>
        </div>
      </section>

      <CommandAgentPanel surface="dispatch" />

      <CallOpsPanel />

      <AssignmentHistory />

      <SelfClaimsFeed />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Team load</h2>
        <div className="overflow-x-auto card-elevated">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Agent</th>
                <th className="px-4 py-2 text-right">Assigned</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-right">Open work</th>
                <th className="px-4 py-2 text-right">Connected</th>
                <th className="px-4 py-2 text-right">Hot</th>
                <th className="px-4 py-2 text-right">Warm</th>
                <th className="px-4 py-2 text-right">Cold</th>
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
                    <td className="tabular px-4 py-2 text-right">{row.pendingWork}</td>
                    <td className="tabular px-4 py-2 text-right">{row.connected}</td>
                    <td className="tabular px-4 py-2 text-right">{row.hot}</td>
                    <td className="tabular px-4 py-2 text-right">{row.warm}</td>
                    <td className="tabular px-4 py-2 text-right">{row.cold}</td>
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

      <section className="border-t border-border pt-6">
        <QueueBoard title="Agent Queue" canSeeAllAgents showManualLog />
      </section>
    </div>
  );
}
