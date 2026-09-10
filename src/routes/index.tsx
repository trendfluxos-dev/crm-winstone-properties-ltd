import { createFileRoute } from "@tanstack/react-router";
import { Lock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import logoAsset from "@/assets/winstone-logo.png.asset.json";
import { AdminGate } from "@/components/crm/AdminPinDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadDossier } from "@/components/crm/LeadDossier";
import { ManualIngestDialog } from "@/components/crm/ManualIngestDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildTimeline,
  latestVerifiedCall,
  LEAD_STATUSES,
  useSnapshot,
} from "@/lib/crm-data";
import { useAdminToken, useOperatorId } from "@/lib/local-session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Agent Workspace — Tele-Sales CRM OS" },
      {
        name: "description",
        content:
          "One-tap dialling, WhatsApp deep links and AI call context for every lead in the pipeline.",
      },
      { property: "og:title", content: "Agent Workspace — Tele-Sales CRM OS" },
      {
        property: "og:description",
        content: "Work the pipeline stage by stage with verified call audio and AI summaries.",
      },
    ],
  }),
  pendingComponent: () => (
    <AppShell>
      <SnapshotSkeleton />
    </AppShell>
  ),
  component: LeadQueue,
});

function LeadQueue() {
  const { profiles, leads, calls, messages, isPending } = useSnapshot();
  // Only authority (IT console / HQ / coordinator PIN) may look across agents.
  const isAuthority = useAdminToken() !== null;

  const [search, setSearch] = useState("");
  const operatorId = useOperatorId();
  const [agentFilter, setAgentFilter] = useState("all");
  // Follow the top-bar "Operating as" agent so each agent lands on their own queue.
  useEffect(() => {
    setAgentFilter(operatorId ?? "all");
  }, [operatorId]);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  const agents = useMemo(
    () => profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [profiles],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesAgent =
        agentFilter === "all" ||
        (agentFilter === "unassigned" ? lead.assigned_to === null : lead.assigned_to === agentFilter);
      const matchesSearch =
        !needle ||
        lead.name.toLowerCase().includes(needle) ||
        lead.phone_number.includes(needle) ||
        (lead.company ?? "").toLowerCase().includes(needle);
      return matchesAgent && matchesSearch;
    });
  }, [leads, search, agentFilter]);

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">My Leads</h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {filtered.length} of {leads.length} leads · one tap to dial or open WhatsApp
            </p>
          </div>
          <div className="shrink-0">
            <AdminGate
              locked={(openPin) => (
                <Button variant="secondary" size="sm" onClick={openPin}>
                  <Lock className="size-4" /> Manual log
                </Button>
              )}
            >
              <ManualIngestDialog leads={leads} agents={agents} />
            </AdminGate>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company or number"
              className="pl-9"
            />
          </div>
          {isAuthority && (
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {!isAuthority && !operatorId && (
          <p className="rounded-xl border border-dashed border-border bg-card p-4 text-center text-sm text-muted-foreground">
            Pick your name in “Operating as” at the top to load your own leads. Other agents’ leads
            stay private.
          </p>
        )}

        {isPending && <SnapshotSkeleton />}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {LEAD_STATUSES.map((status) => {
            const columnLeads = filtered.filter((lead) => lead.status === status.key);
            return (
              <section key={status.key} className="space-y-3">
                <header className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                  <h2 className="text-sm font-semibold">{status.label}</h2>
                  <span className="tabular text-xs text-muted-foreground">
                    {columnLeads.length}
                  </span>
                </header>
                <div className="space-y-3">
                  {columnLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      agent={profiles.find((p) => p.id === lead.assigned_to)}
                      verifiedCall={latestVerifiedCall(calls, lead.id)}
                      onOpen={() => setOpenLeadId(lead.id)}
                    />
                  ))}
                  {columnLeads.length === 0 && (
                    <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Nothing here
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
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
