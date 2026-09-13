import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
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
import { CalendarClock, ChevronDown, Clock, Flame, MessageSquareQuote, Users } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { executiveBrief } from "@/lib/hq-brief.functions";
import type { BriefAgent, BriefBlock } from "@/lib/hq-brief.server";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

const SLICE_COLORS = [
  "var(--primary)",
  "var(--live)",
  "var(--chart-3, #f59e0b)",
  "var(--chart-4, #8b5cf6)",
  "var(--chart-5, #14b8a6)",
  "var(--muted-foreground)",
];

const TEMP_LABEL: Record<string, string> = { hot: "HOT", warm: "WARM", cold: "COLD" };

/**
 * The Executive HQ presentation. Everything here comes from the agents' own
 * submitted updates: who they spoke to, from when to when, how long, what was
 * discussed. No technical or system state appears on this surface.
 */
export function ExecutiveBrief() {
  const adminToken = useAdminToken();
  const load = useServerFn(executiveBrief);
  const query = useQuery({
    queryKey: ["executive-brief", adminToken ? "pin" : "session"],
    queryFn: () => load({ data: { adminToken: getAdminToken() } }),
    refetchInterval: 45_000,
  });

  // An update submitted or corrected right now must move these numbers at once.
  useEffect(() => {
    const channel = supabase
      .channel("executive-brief")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_reports" }, () => {
        void query.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = query.data;

  if (!data) {
    return (
      <section className="card-elevated p-6">
        <p className="text-sm text-muted-foreground">প্রেজেন্টেশন তৈরি হচ্ছে…</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card-elevated relative overflow-hidden p-5">
        <span className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <CalendarClock className="size-3.5" /> এক্সিকিউটিভ প্রেজেন্টেশন
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{data.headline}</h2>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{data.subline}</p>
          </div>
          <p className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            হালনাগাদ: {data.generatedAtLabel}
          </p>
        </div>
      </section>

      <BriefBlockView block={data.main} />
      {data.liveAddon ? <BriefBlockView block={data.liveAddon} accent /> : null}
    </div>
  );
}

function BriefBlockView({ block, accent = false }: { block: BriefBlock; accent?: boolean }) {
  const chart = block.agents.map((a) => ({
    name: a.name.split(" ")[0] ?? a.name,
    কথা: a.connected,
    মিনিট: Math.round(a.talkSeconds / 60),
  }));

  return (
    <section
      className={`card-elevated space-y-5 p-4 sm:p-5 ${accent ? "border-primary/40 bg-primary/[0.03]" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold tracking-tight sm:text-base">{block.label}</h3>
        {block.live ? (
          <span className="flex items-center gap-1.5 rounded-full bg-live/10 px-2 py-0.5 text-[11px] font-semibold text-live">
            <span className="size-1.5 animate-pulse rounded-full bg-live" /> লাইভ সিঙ্ক
          </span>
        ) : (
          <Badge variant="secondary">সম্পূর্ণ রিপোর্ট</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {block.fromLabel} — {block.toLabel}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<Users className="size-4" />}
          label="কাজ করেছেন"
          value={`${block.totals.agentsWorking} জন`}
          hint={`${block.totals.calls}টি কল আপডেট জমা`}
        />
        <Tile
          icon={<MessageSquareQuote className="size-4" />}
          label="কথা হয়েছে"
          value={String(block.totals.connected)}
          hint={
            block.totals.calls
              ? `${Math.round((block.totals.connected / block.totals.calls) * 100)}% কলে কথা হয়েছে`
              : "এখনো হিসাব শুরু হয়নি"
          }
        />
        <Tile
          icon={<Clock className="size-4" />}
          label="মোট কথার সময়"
          value={block.totals.talkLabel}
          hint="এজেন্টদের নিজের রিপোর্ট অনুযায়ী"
        />
        <Tile
          icon={<Flame className="size-4" />}
          label="HOT / WARM / COLD"
          value={`${block.totals.hot} / ${block.totals.warm} / ${block.totals.cold}`}
          hint={`${block.totals.followUps}টি ফলো-আপ সময় ঠিক করা`}
        />
      </div>

      {/* Discussion text: the same numbers, read out in plain language. */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          আলোচনা
        </p>
        <ul className="mt-2 space-y-1.5">
          {block.narrative.map((line, index) => (
            <li key={index} className="flex gap-2 text-sm leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {block.totals.calls > 0 && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              এজেন্টভিত্তিক কথা ও কথার মিনিট
            </p>
            <div className="h-56 rounded-xl border border-border p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                  <Tooltip contentStyle={TOOLTIP} cursor={{ fill: "var(--surface-2)" }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="কথা" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="মিনিট" fill="var(--live)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">আলোচনার ধরন</p>
            <div className="h-56 rounded-xl border border-border p-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={block.categories}
                    dataKey="count"
                    nameKey="label"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                  >
                    {block.categories.map((slice, index) => (
                      <Cell key={slice.label} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {block.hourly.length > 1 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            ঘণ্টা ধরে কাজের গতি (কয়টা থেকে কয়টা)
          </p>
          <div className="h-48 rounded-xl border border-border p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={block.hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  type="monotone"
                  dataKey="calls"
                  name="কল"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="minutes"
                  name="কথার মিনিট"
                  stroke="var(--live)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {block.leads.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground">
            লিডভিত্তিক সামারি — কোন লিডের সাথে কতক্ষণ কথা, কী ধরন, কী আলোচনা
          </p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-3 py-2">লিড</th>
                  <th className="px-3 py-2">শেষ কথা</th>
                  <th className="px-3 py-2">মোট সময়</th>
                  <th className="px-3 py-2">ক্যাটাগরি</th>
                  <th className="px-3 py-2">লিডের সামারি</th>
                  <th className="px-3 py-2">এজেন্ট</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {block.leads.map((lead) => (
                  <tr key={lead.leadId}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{lead.name}</p>
                      <p className="tabular text-[11px] text-muted-foreground">{lead.phone}</p>
                    </td>
                    <td className="tabular px-3 py-2 text-xs">
                      {lead.lastFromLabel} — {lead.lastToLabel}
                      {lead.calls > 1 ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {lead.calls} বার কল
                        </span>
                      ) : null}
                    </td>
                    <td className="tabular px-3 py-2">{lead.talkLabel}</td>
                    <td className="px-3 py-2 text-xs">
                      {lead.categoryLabel}
                      {lead.temperature ? ` · ${TEMP_LABEL[lead.temperature] ?? lead.temperature}` : ""}
                      {lead.grade ? ` · গ্রেড ${lead.grade}` : ""}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-muted-foreground">
                      {lead.summary || "—"}
                      {lead.followUpLabel ? (
                        <span className="block text-[11px] text-primary">
                          ফলো-আপ {lead.followUpLabel}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs">{lead.lastAgentName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground">
          এজেন্ট পারফরম্যান্স — এজেন্ট বাছাই করে তার প্রতিটি কথার বিবরণ দেখুন
        </p>
        {block.agents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            এই উইন্ডোতে এখনো কোনো এজেন্ট আপডেট জমা দেননি।
          </p>
        ) : (
          block.agents.map((agent) => <AgentRow key={agent.agentId} agent={agent} />)
        )}
      </div>
    </section>
  );
}

const TOOLTIP = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
} as const;

function AgentRow({ agent }: { agent: BriefAgent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-surface">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="text-sm font-semibold">{agent.name}</span>
        {agent.employeeId ? (
          <span className="text-[11px] text-muted-foreground">{agent.employeeId}</span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="secondary">কথা {agent.connected}</Badge>
          <Badge variant="secondary">সময় {agent.talkLabel}</Badge>
          <Badge variant="outline">HOT {agent.hot}</Badge>
          {agent.bestCategory ? <Badge variant="outline">{agent.bestCategory}</Badge> : null}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-3 py-2">কার সাথে</th>
                <th className="px-3 py-2">নম্বর</th>
                <th className="px-3 py-2">কয়টা থেকে কয়টা</th>
                <th className="px-3 py-2">কতক্ষণ</th>
                <th className="px-3 py-2">ধরন</th>
                <th className="px-3 py-2">আলোচনা</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {agent.calls_detail.map((call) => (
                <tr key={call.id}>
                  <td className="px-3 py-2 font-medium">{call.leadName}</td>
                  <td className="tabular px-3 py-2 text-xs">{call.phone}</td>
                  <td className="tabular px-3 py-2 text-xs">
                    {call.fromLabel} — {call.toLabel}
                  </td>
                  <td className="tabular px-3 py-2">{call.talkLabel}</td>
                  <td className="px-3 py-2 text-xs">
                    {call.categoryLabel}
                    {call.temperature ? ` · ${TEMP_LABEL[call.temperature] ?? call.temperature}` : ""}
                    {call.grade ? ` · গ্রেড ${call.grade}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {call.summary || "—"}
                    {call.followUpLabel ? (
                      <span className="block text-[11px] text-primary">
                        ফলো-আপ {call.followUpLabel}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Tile({
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
    <div className="rounded-xl border border-border p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="grid size-6 place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        {label}
      </p>
      <p className="tabular mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
