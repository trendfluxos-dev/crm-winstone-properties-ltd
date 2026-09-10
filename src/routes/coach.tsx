import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ListChecks,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCoachBriefing } from "@/lib/coach.functions";
import { useSnapshot } from "@/lib/crm-data";
import { useAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "AI Sales Coach — Winstone Connect" },
      {
        name: "description",
        content:
          "Real-time coaching built from each agent's own call transcripts and WhatsApp logs: what is working, what is slipping and the next calls to make.",
      },
      { property: "og:title", content: "AI Sales Coach — Winstone Connect" },
      {
        property: "og:description",
        content: "Per-agent performance summary and next steps from real call and WhatsApp activity.",
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
  component: CoachPage,
});

type Briefing = Awaited<ReturnType<typeof getCoachBriefing>>;

function CoachPage() {
  const { profiles } = useSnapshot();
  const token = useAdminToken();
  const isAuthority = token !== null;

  const agents = useMemo(
    () => profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [profiles],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const agentId = isAuthority ? selected : null;
  const [briefing, setBriefing] = useState<Briefing | null>(null);

  const run = useMutation({
    mutationFn: (id: string) => getCoachBriefing({ data: { token, agentId: id } }),
    onSuccess: (result) => setBriefing(result),
  });

  useEffect(() => {
    if (isAuthority && !selected && agents.length) setSelected(agents[0]!.id);
  }, [isAuthority, selected, agents]);

  useEffect(() => {
    if (agentId) {
      setBriefing(null);
      run.mutate(agentId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
              <Brain className="size-5 text-primary" /> AI Sales Coach
            </h1>
            <p className="text-xs text-muted-foreground sm:text-sm">
              Built live from real call transcripts and WhatsApp chats — no guessing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAuthority && (
              <Select value={selected ?? ""} onValueChange={setSelected}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Pick an agent" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                      {a.employee_id ? ` · ${a.employee_id}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              onClick={() => agentId && run.mutate(agentId)}
              disabled={!agentId || run.isPending}
            >
              <RefreshCw className={`size-4 ${run.isPending ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {!agentId && (
          <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Unlock authority access to load an agent coaching briefing.
          </p>
        )}

        {run.isPending && <SnapshotSkeleton />}

        {run.isError && (
          <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            {(run.error as Error).message}
          </p>
        )}

        {briefing && !run.isPending && <BriefingView briefing={briefing} />}
      </div>
    </AppShell>
  );
}

function BriefingView({ briefing }: { briefing: Briefing }) {
  const m = briefing.metrics;
  return (
    <div className="space-y-5">
      <div className="card-elevated space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="rounded-full">
            <Sparkles className="mr-1 size-3" />
            {briefing.aiAvailable ? "AI coached" : "Numbers only"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {briefing.agent.name}
            {briefing.agent.employeeId ? ` · ${briefing.agent.employeeId}` : ""} ·{" "}
            {new Date(briefing.generatedAt).toLocaleTimeString()}
          </span>
        </div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{briefing.headline}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{briefing.summary}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Dials" value={String(m.dials)} hint={`Target ${m.dialTarget}/day`} />
        <Tile
          label="Connected"
          value={`${m.connectRate.toFixed(0)}%`}
          hint={`${m.connected} of ${m.dials} calls`}
        />
        <Tile label="Talk time" value={`${m.talkMinutes} min`} hint={`Avg ${m.avgCallSeconds}s per call`} />
        <Tile label="Deals won" value={String(m.dealsWon)} hint={`${m.assigned} leads assigned`} />
        <Tile label="WhatsApp touches" value={String(m.whatsappTouches)} hint="Messages sent by this agent" />
        <Tile label="Overdue follow-ups" value={String(m.overdueFollowUps)} hint="Past the callback deadline" />
        <Tile label="Never dialled" value={String(m.untouchedLeads)} hint="Leads with zero attempts" />
        <Tile
          label="Call mood"
          value={`${m.sentiment.positive}+ / ${m.sentiment.negative + m.sentiment.critical}-`}
          hint={`${m.sentiment.neutral} neutral`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title="Working well"
          icon={<CheckCircle2 className="size-4 text-live" />}
          items={briefing.strengths}
          empty="Not enough activity to praise yet."
        />
        <ListCard
          title="Watch out"
          icon={<AlertTriangle className="size-4 text-warning" />}
          items={briefing.risks}
          empty="No risks flagged."
        />
      </div>

      <div className="card-elevated p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="size-4 text-primary" /> Next steps
        </h3>
        <ol className="mt-3 space-y-2">
          {briefing.nextSteps.length === 0 && (
            <li className="text-sm text-muted-foreground">Nothing pending right now.</li>
          )}
          {briefing.nextSteps.map((step, i) => (
            <li key={i} className="flex gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {i + 1}
              </span>
              <span>
                {step.lead && <span className="font-semibold">{step.lead}: </span>}
                {step.action}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {m.topObjections.length > 0 && (
        <div className="card-elevated p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <TrendingUp className="size-4 text-primary" /> What customers push back on
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {m.topObjections.map((o) => (
              <Badge key={o.objection} variant="secondary" className="rounded-full">
                {o.objection} · {o.count}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ListCard({
  title,
  icon,
  items,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
  empty: string;
}) {
  return (
    <div className="card-elevated p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        {icon} {title}
      </h3>
      <ul className="mt-3 space-y-2 text-sm">
        {items.length === 0 && <li className="text-muted-foreground">{empty}</li>}
        {items.map((item, i) => (
          <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
