import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { LeadCard } from "@/components/crm/LeadCard";
import { LeadDossier } from "@/components/crm/LeadDossier";
import {
  LeadQuickFilter,
  matchesCategory,
  matchesPeriod,
  type LeadCategory,
  type LeadPeriod,
} from "@/components/crm/LeadQuickFilter";
import { ManualIngestDialog } from "@/components/crm/ManualIngestDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildTimeline, latestVerifiedCall, LEAD_STATUSES, useSnapshot } from "@/lib/crm-data";

/**
 * The lead queue board. The server already scopes the snapshot, so an agent
 * only ever receives their own leads; supervisors also get an agent filter.
 */
export function QueueBoard({
  title = "Lead Queue",
  canSeeAllAgents = false,
  showManualLog = false,
}: {
  title?: string;
  canSeeAllAgents?: boolean;
  showManualLog?: boolean;
}) {
  const { profiles, leads, calls, messages, events, isPending } = useSnapshot();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("all");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [period, setPeriod] = useState<LeadPeriod>("all");
  const [category, setCategory] = useState<LeadCategory>("all");

  const agents = useMemo(
    () => profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [profiles],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesAgent =
        agentFilter === "all" ||
        (agentFilter === "unassigned"
          ? lead.assigned_to === null
          : lead.assigned_to === agentFilter);
      const matchesSearch =
        !needle ||
        lead.name.toLowerCase().includes(needle) ||
        lead.phone_number.includes(needle) ||
        (lead.company ?? "").toLowerCase().includes(needle);
      return (
        matchesAgent &&
        matchesSearch &&
        matchesPeriod(lead, period) &&
        matchesCategory(lead, category)
      );
    });
  }, [leads, search, agentFilter, period, category]);

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {filtered.length} of {leads.length} leads · one tap to dial or open WhatsApp
          </p>
        </div>
        {showManualLog && (
          <div className="shrink-0">
            <ManualIngestDialog leads={leads} agents={agents} />
          </div>
        )}
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
        {canSeeAllAgents && (
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

      {isPending && <SnapshotSkeleton />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {LEAD_STATUSES.map((status) => {
          const columnLeads = filtered.filter((lead) => lead.status === status.key);
          return (
            <section key={status.key} className="min-w-0 space-y-3">
              <header className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2">
                <h3 className="text-sm font-semibold">{status.label}</h3>
                <span className="tabular text-xs text-muted-foreground">{columnLeads.length}</span>
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

      <LeadDossier
        lead={openLead}
        agents={profiles}
        timeline={openLead ? buildTimeline(calls, messages, openLead.id, events) : []}
        open={openLeadId !== null}
        onOpenChange={(next) => !next && setOpenLeadId(null)}
      />
    </div>
  );
}
