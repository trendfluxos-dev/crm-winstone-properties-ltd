import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Download, Inbox, RotateCcw, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RoleGate } from "@/components/crm/RoleGate";
import { DayCallExportPanel } from "@/components/crm/DayCallExportPanel";
import { SyncedCallsPanel } from "@/components/crm/SyncedCallsPanel";
import { useMyAccount } from "@/lib/session";
import { AppShell } from "@/components/crm/AppShell";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEAD_STATUSES, useSnapshot, type LeadStatus } from "@/lib/crm-data";
import {
  buildReport,
  defaultFilters,
  downloadCsv,
  leadSources,
  reportToCsv,
  toCsv,
  type ReportFilters,
} from "@/lib/crm-reports";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Custom Reports — Winstone Connect" },
      {
        name: "description",
        content:
          "Filterable tele-sales performance reports: dial and connect trends, lead funnel, source mix, agent scorecards and CSV export.",
      },
      { property: "og:title", content: "Custom Reports — Winstone Connect" },
      {
        property: "og:description",
        content: "Charts, filters and CSV export for call activity, lead funnel and agent output.",
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
  component: ReportsPage,
});

function ReportsPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority", "coordinator", "agent"]}
        icon={<BarChart3 className="size-7" />}
        title="Reports"
        description="Performance charts, filters and exports. Sign in to your desk or enter the master PIN."
      >
        <ReportsBoard />
      </RoleGate>
    </AppShell>
  );
}

const PIE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const PRESETS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

/** hh mm from whole minutes — talk time reads as time, not as a raw number. */
function talkLabel(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

function ReportsBoard() {
  const data = useSnapshot();
  const { scope } = useMyAccount();
  const canSeeDayExport = scope === "authority" || scope === "coordinator";
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters(30));

  const sources = useMemo(() => leadSources(data.leads), [data.leads]);
  const agents = useMemo(
    () => data.profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [data.profiles],
  );
  const report = useMemo(() => buildReport(data, filters), [data, filters]);

  const patch = (next: Partial<ReportFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const stamp = `${filters.from}_to_${filters.to}`;
  const totals = report.totals;
  const hasActivity = totals.dials > 0 || totals.newLeads > 0 || totals.whatsapp > 0;

  // Keep the x-axis readable: show roughly a dozen labels whatever the range.
  const labelInterval = Math.max(0, Math.ceil(report.daily.length / 12) - 1);

  return (
    <div className="space-y-5">
      {/* Header + actions */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">Reports</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Performance &amp; activity intelligence
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv(`winstone-report_${stamp}.csv`, reportToCsv(report))}
          >
            <Download className="size-4" /> Full CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `winstone-agent-scorecard_${stamp}.csv`,
                toCsv(
                  [
                    "Agent",
                    "Employee ID",
                    "Dials",
                    "Connected",
                    "Connect %",
                    "Talk minutes",
                    "WhatsApp",
                    "Assigned",
                    "Deals won",
                    "Conversion %",
                  ],
                  report.rows.map((r) => [
                    r.agent,
                    r.employeeId,
                    r.dials,
                    r.connected,
                    r.connectRate.toFixed(1),
                    r.talkMinutes,
                    r.whatsapp,
                    r.assigned,
                    r.dealsWon,
                    r.conversionRate.toFixed(1),
                  ]),
                ),
              )
            }
          >
            <Download className="size-4" /> Scorecards
          </Button>
          <CopilotDrawer />
        </div>
      </div>

      {/* Filters — one compact strip */}
      <section className="rounded-2xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-end gap-2.5">
          <Field label="From">
            <Input
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(e) => patch({ from: e.target.value })}
              className="h-9 w-[146px]"
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={(e) => patch({ to: e.target.value })}
              className="h-9 w-[146px]"
            />
          </Field>
          <Field label="Agent">
            <Select value={filters.agentId} onValueChange={(v) => patch({ agentId: v })}>
              <SelectTrigger className="h-9 w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Source">
            <Select value={filters.source} onValueChange={(v) => patch({ source: v })}>
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                {sources.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Stage">
            <Select
              value={filters.status}
              onValueChange={(v) => patch({ status: v as LeadStatus | "all" })}
            >
              <SelectTrigger className="h-9 w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {LEAD_STATUSES.map((s) => (
                  <SelectItem key={s.key} value={s.key}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.days}
                variant="secondary"
                size="sm"
                onClick={() => patch(defaultFilters(p.days))}
              >
                {p.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setFilters(defaultFilters(30))}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          </div>
        </div>
      </section>

      {/* KPI strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Dials"
          value={totals.dials}
          hint={`${totals.activeAgents} agents in scope`}
          empty="No activity yet"
        />
        <Kpi
          label="Connected"
          value={totals.connected}
          hint="conversations"
          empty="No conversations"
        />
        <Kpi
          label="Connect %"
          value={totals.dials > 0 ? `${totals.connectRate.toFixed(0)}%` : 0}
          hint="of dials answered"
          empty="Needs dials"
        />
        <Kpi
          label="Talk time"
          value={totals.talkMinutes > 0 ? talkLabel(totals.talkMinutes) : 0}
          hint={`${totals.whatsapp} WhatsApp touches`}
          empty="No recorded talk"
        />
        <Kpi label="New leads" value={totals.newLeads} hint="in this range" empty="None added" />
        <Kpi label="Deals won" value={totals.dealsWon} hint="closed won" empty="None yet" />
      </section>

      {/* Daily activity */}
      <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Daily activity</h2>
        <p className="text-xs text-muted-foreground">Dials vs connected conversations</p>
        {!hasActivity ? (
          <EmptyCard
            title="No activity recorded"
            body="Once agent calls sync for this period the trend appears here."
            action={
              <Button variant="outline" size="sm" onClick={() => setFilters(defaultFilters(30))}>
                <RotateCcw className="size-4" /> Adjust filters
              </Button>
            }
          />
        ) : (
          <div className="mt-3 h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={report.daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="rp-dials" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="rp-conn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  interval={labelInterval}
                  minTickGap={16}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  allowDecimals={false}
                />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="dials"
                  name="Dials"
                  stroke="var(--chart-1)"
                  fill="url(#rp-dials)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="connected"
                  name="Connected"
                  stroke="var(--chart-3)"
                  fill="url(#rp-conn)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Business intelligence grid — one card, one question */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Lead funnel</h2>
          <p className="text-xs text-muted-foreground">Leads by stage</p>
          {report.statusMix.length === 0 ? (
            <EmptyCard title="No lead activity for this period" body="Adjust the date or filters." />
          ) : (
            <BreakdownList rows={report.statusMix} />
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Lead source mix</h2>
          <p className="text-xs text-muted-foreground">Where leads came from</p>
          {report.sourceMix.length === 0 ? (
            <EmptyCard title="No sources for this period" body="Adjust the date or filters." />
          ) : (
            <div className="mt-3 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Pie
                    data={report.sourceMix}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={42}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {report.sourceMix.map((entry, i) => (
                      <Cell key={entry.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Call sentiment</h2>
          <p className="text-xs text-muted-foreground">From AI-analysed calls</p>
          {report.sentimentMix.length === 0 ? (
            <EmptyCard
              title="No AI-analysed calls in this range"
              body="Sentiment appears after call analysis runs."
            />
          ) : (
            <BreakdownList rows={report.sentimentMix} />
          )}
        </div>
      </section>

      {/* AI performance brief — plain facts from the numbers above, nothing invented. */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" /> AI performance brief
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {hasActivity
            ? `${filters.from} → ${filters.to}: ${totals.dials} dials, ${totals.connected} connected (${totals.connectRate.toFixed(0)}% connect rate) across ${totals.activeAgents} agents, ${talkLabel(totals.talkMinutes)} talk time, ${totals.newLeads} new leads and ${totals.dealsWon} deals won.`
            : "No activity was recorded in this period, so there is nothing to summarise. Widen the date range or clear the filters."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Open Copilot above for a deeper question on this same data.
        </p>
      </section>

      {/* Agent performance */}
      <section className="rounded-2xl border border-border bg-card p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Agent performance</h2>
        <p className="text-xs text-muted-foreground">
          Activity, connection and conversion overview
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="py-2 pr-3 text-right font-semibold">Dials</th>
                <th className="py-2 pr-3 text-right font-semibold">Connected</th>
                <th className="py-2 pr-3 text-right font-semibold">Connect %</th>
                <th className="py-2 pr-3 text-right font-semibold">Talk</th>
                <th className="py-2 pr-3 text-right font-semibold">Avg call</th>
                <th className="py-2 pr-3 text-right font-semibold">WhatsApp</th>
                <th className="py-2 pr-3 text-right font-semibold">Assigned</th>
                <th className="py-2 pr-3 text-right font-semibold">Won</th>
                <th className="py-2 text-right font-semibold">Conv %</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    No agents match these filters.
                  </td>
                </tr>
              )}
              {report.rows.map((r) => (
                <tr
                  key={r.agentId}
                  className="border-t border-border/60 transition-colors hover:bg-surface-2"
                >
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.agent}</span>
                    <span className="ml-2 text-xs text-muted-foreground tabular">
                      {r.employeeId}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular">{r.dials}</td>
                  <td className="py-2 pr-3 text-right tabular">{r.connected}</td>
                  <td className="py-2 pr-3 text-right tabular">{r.connectRate.toFixed(0)}%</td>
                  <td className="py-2 pr-3 text-right tabular">{talkLabel(r.talkMinutes)}</td>
                  <td className="py-2 pr-3 text-right tabular">{r.avgCallSeconds}s</td>
                  <td className="py-2 pr-3 text-right tabular">{r.whatsapp}</td>
                  <td className="py-2 pr-3 text-right tabular">{r.assigned}</td>
                  <td className="py-2 pr-3 text-right tabular">{r.dealsWon}</td>
                  <td className="py-2 text-right tabular">{r.conversionRate.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canSeeDayExport && (
        <div className="space-y-4">
          <DayCallExportPanel />
          <SyncedCallsPanel />
        </div>
      )}
    </div>
  );
}

const TOOLTIP = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  fontSize: 12,
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Kpi({
  label,
  value,
  hint,
  empty,
}: {
  label: string;
  value: string | number;
  hint: string;
  empty: string;
}) {
  const isEmpty = value === 0 || value === "0";
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="tabular mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{isEmpty ? empty : hint}</p>
    </div>
  );
}

/** Compact ranked breakdown — reads faster than a chart for small categories. */
function BreakdownList({ rows }: { rows: { key: string; label: string; value: number }[] }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((row, i) => {
        const pct = Math.round((row.value / total) * 100);
        return (
          <li key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{row.label}</span>
              <span className="tabular shrink-0 font-semibold">
                {row.value}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">{pct}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: PIE_COLORS[i % PIE_COLORS.length],
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Compact, explanatory empty state — never a tall blank chart box. */
function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-xl border border-dashed border-border bg-surface-2 px-4 py-6 text-center">
      <Inbox className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 text-sm font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
