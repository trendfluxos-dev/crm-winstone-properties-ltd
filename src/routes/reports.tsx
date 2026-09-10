import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, Download, Lock, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AdminGate } from "@/components/crm/AdminPinDialog";
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
      <AdminGate
        locked={(openPin) => (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <BarChart3 className="size-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Custom Reports</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Performance charts, filters and exports. Master PIN required.
              </p>
            </div>
            <Button size="lg" onClick={openPin}>
              <Lock className="size-4" /> Enter PIN
            </Button>
          </div>
        )}
      >
        <ReportsBoard />
      </AdminGate>
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
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

function ReportsBoard() {
  const data = useSnapshot();
  const [filters, setFilters] = useState<ReportFilters>(() => defaultFilters(30));

  const sources = useMemo(() => leadSources(data.leads), [data.leads]);
  const agents = useMemo(
    () => data.profiles.filter((p) => p.role === "agent" || p.role === "team_leader"),
    [data.profiles],
  );
  const report = useMemo(() => buildReport(data, filters), [data, filters]);

  const patch = (next: Partial<ReportFilters>) => setFilters((prev) => ({ ...prev, ...next }));
  const stamp = `${filters.from}_to_${filters.to}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Custom Reports</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Filter the floor by date, agent, source and lead stage — then export.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `winstone-report_${stamp}.csv`,
                reportToCsv(report),
              )
            }
          >
            <Download className="size-4" /> Full report CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `winstone-agent-scorecard_${stamp}.csv`,
                toCsv(
                  ["Agent", "Employee ID", "Dials", "Connected", "Connect %", "Talk minutes", "WhatsApp", "Assigned", "Deals won", "Conversion %"],
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
            <Download className="size-4" /> Agent scorecard
          </Button>
          <CopilotDrawer />
        </div>
      </div>

      {/* Filters */}
      <section className="card-elevated flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">
            <Input
              type="date"
              value={filters.from}
              max={filters.to}
              onChange={(e) => patch({ from: e.target.value })}
              className="h-9 w-[150px]"
            />
          </Field>
          <Field label="To">
            <Input
              type="date"
              value={filters.to}
              min={filters.from}
              onChange={(e) => patch({ to: e.target.value })}
              className="h-9 w-[150px]"
            />
          </Field>
          <Field label="Agent">
            <Select value={filters.agentId} onValueChange={(v) => patch({ agentId: v })}>
              <SelectTrigger className="h-9 w-[190px]">
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
          <Field label="Lead source">
            <Select value={filters.source} onValueChange={(v) => patch({ source: v })}>
              <SelectTrigger className="h-9 w-[170px]">
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
          <Field label="Lead stage">
            <Select
              value={filters.status}
              onValueChange={(v) => patch({ status: v as LeadStatus | "all" })}
            >
              <SelectTrigger className="h-9 w-[160px]">
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
          <div className="flex flex-wrap items-center gap-1.5">
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

      {/* Totals */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Dials" value={String(report.totals.dials)} hint={`${report.totals.activeAgents} agents in scope`} />
        <Tile
          label="Connected"
          value={`${report.totals.connectRate.toFixed(0)}%`}
          hint={`${report.totals.connected} conversations`}
        />
        <Tile label="Talk minutes" value={report.totals.talkMinutes.toFixed(0)} hint={`${report.totals.whatsapp} WhatsApp touches`} />
        <Tile label="Deals won" value={String(report.totals.dealsWon)} hint={`${report.totals.newLeads} new leads`} />
      </section>

      {/* Trend */}
      <section className="card-elevated p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Daily activity</h2>
        <p className="text-xs text-muted-foreground">Dials vs connected conversations.</p>
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
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="dials" name="Dials" stroke="var(--chart-1)" fill="url(#rp-dials)" strokeWidth={2} />
              <Area type="monotone" dataKey="connected" name="Connected" stroke="var(--chart-3)" fill="url(#rp-conn)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card-elevated p-3 sm:p-4">
          <h2 className="text-sm font-semibold">New leads &amp; WhatsApp touches</h2>
          <div className="mt-3 h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report.daily} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="newLeads" name="New leads" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="whatsapp" name="WhatsApp" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="talkMinutes" name="Talk min" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-elevated p-3 sm:p-4">
          <h2 className="text-sm font-semibold">Lead funnel</h2>
          <div className="mt-3 h-[240px]">
            {report.statusMix.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.statusMix} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP} />
                  <Bar dataKey="value" name="Leads" radius={[6, 6, 0, 0]}>
                    {report.statusMix.map((entry, i) => (
                      <Cell key={entry.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-elevated p-3 sm:p-4">
          <h2 className="text-sm font-semibold">Lead source mix</h2>
          <div className="mt-3 h-[240px]">
            {report.sourceMix.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Pie
                    data={report.sourceMix}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {report.sourceMix.map((entry, i) => (
                      <Cell key={entry.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="card-elevated p-3 sm:p-4">
          <h2 className="text-sm font-semibold">Call sentiment</h2>
          <div className="mt-3 h-[240px]">
            {report.sentimentMix.length === 0 ? (
              <Empty text="No AI-analysed calls in this range." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip contentStyle={TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Pie data={report.sentimentMix} dataKey="value" nameKey="label" outerRadius={80}>
                    {report.sentimentMix.map((entry, i) => (
                      <Cell key={entry.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* Scorecard */}
      <section className="card-elevated p-3 sm:p-4">
        <h2 className="text-sm font-semibold">Agent scorecard</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Agent</th>
                <th className="py-2 pr-3 font-semibold">Dials</th>
                <th className="py-2 pr-3 font-semibold">Connected</th>
                <th className="py-2 pr-3 font-semibold">Connect %</th>
                <th className="py-2 pr-3 font-semibold">Talk min</th>
                <th className="py-2 pr-3 font-semibold">Avg call</th>
                <th className="py-2 pr-3 font-semibold">WhatsApp</th>
                <th className="py-2 pr-3 font-semibold">Assigned</th>
                <th className="py-2 pr-3 font-semibold">Won</th>
                <th className="py-2 font-semibold">Conv %</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {report.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    No agents match these filters.
                  </td>
                </tr>
              )}
              {report.rows.map((r) => (
                <tr key={r.agentId} className="border-t border-border/70">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{r.agent}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{r.employeeId}</span>
                  </td>
                  <td className="py-2 pr-3">{r.dials}</td>
                  <td className="py-2 pr-3">{r.connected}</td>
                  <td className="py-2 pr-3">{r.connectRate.toFixed(0)}%</td>
                  <td className="py-2 pr-3">{r.talkMinutes.toFixed(0)}</td>
                  <td className="py-2 pr-3">{r.avgCallSeconds}s</td>
                  <td className="py-2 pr-3">{r.whatsapp}</td>
                  <td className="py-2 pr-3">{r.assigned}</td>
                  <td className="py-2 pr-3">{r.dealsWon}</td>
                  <td className="py-2">{r.conversionRate.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-elevated p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Empty({ text = "Nothing to chart for this range." }: { text?: string }) {
  return (
    <div className="grid h-full place-items-center text-sm text-muted-foreground">{text}</div>
  );
}
