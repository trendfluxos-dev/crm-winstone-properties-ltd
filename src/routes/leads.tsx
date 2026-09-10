import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Lock, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminGate } from "@/components/crm/AdminPinDialog";
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
  snapshotQuery,
} from "@/lib/crm-data";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Smart Lead Queue — Tele-Sales CRM OS" },
      {
        name: "description",
        content:
          "One-tap dialling, WhatsApp deep links and AI call context for every lead in the pipeline.",
      },
      { property: "og:title", content: "Smart Lead Queue — Tele-Sales CRM OS" },
      {
        property: "og:description",
        content: "Work the pipeline stage by stage with verified call audio and AI summaries.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(snapshotQuery);
  },
  component: LeadQueue,
});

function LeadQueue() {
  const {
    data: { profiles, leads, calls, messages },
  } = useSuspenseQuery(snapshotQuery);

  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Smart Lead Queue</h1>
            <p className="text-sm text-muted-foreground">
              {filtered.length} of {leads.length} leads · one tap to dial or open WhatsApp
            </p>
          </div>
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

        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, company or number"
              className="pl-9"
            />
          </div>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-[220px]">
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
        </div>

        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
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
