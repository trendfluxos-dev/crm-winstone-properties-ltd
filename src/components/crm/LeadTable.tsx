import { useMemo, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";

import { CallbackLogButton } from "@/components/crm/CallbackLogButton";
import { LeadDossier } from "@/components/crm/LeadDossier";
import {
  LeadQuickFilter,
  matchesCategory,
  matchesPeriod,
  type LeadCategory,
  type LeadPeriod,
} from "@/components/crm/LeadQuickFilter";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { WhatsAppAction } from "@/components/crm/WhatsAppAction";
import { WebCallButton } from "@/components/crm/WebCallButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildTimeline, useSnapshot } from "@/lib/crm-data";
import { relativeTime, shortDate } from "@/lib/crm-format";
import { cn } from "@/lib/utils";

type Filter = "pending" | "follow_up" | "done" | "all";

const FILTER_LABELS: Record<Filter, string> = {
  pending: "কল বাকি",
  follow_up: "আবার যোগাযোগ",
  done: "কথা হয়েছে",
  all: "সব লিড",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "কল হয়নি",
  contacted: "কথা হয়েছে",
  follow_up: "আবার যোগাযোগ",
  closed: "শেষ হয়েছে",
};

const TEMP_STYLES: Record<string, string> = {
  hot: "border-destructive/30 bg-destructive/10 text-destructive",
  warm: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  cold: "border-primary/25 bg-primary/10 text-primary",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "border-idle/30 bg-idle/15 text-idle-foreground",
  contacted: "border-primary/25 bg-accent text-accent-foreground",
  follow_up: "border-chart-4/30 bg-chart-4/10 text-chart-4",
  closed: "border-live/30 bg-live/10 text-live",
};

/**
 * The agent's lead dashboard: one row per lead with serial, name, address,
 * number and who referred it, and a Call button right beside it. A lead only
 * leaves the "কল বাকি" list once a call report says the talk actually happened,
 * so end-of-day it is obvious who still has to be contacted again.
 */
export function LeadTable() {
  const { leads, profiles, calls, messages, events, isPending } = useSnapshot();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [period, setPeriod] = useState<LeadPeriod>("all");
  const [category, setCategory] = useState<LeadCategory>("all");

  // The quick filter narrows the pool first; the status tabs then count within it.
  const scoped = useMemo(
    () => leads.filter((lead) => matchesPeriod(lead, period) && matchesCategory(lead, category)),
    [leads, period, category],
  );

  const counts = useMemo(
    () => ({
      pending: scoped.filter((l) => l.status === "pending").length,
      follow_up: scoped.filter((l) => l.status === "follow_up").length,
      done: scoped.filter((l) => l.status === "contacted" || l.status === "closed").length,
      all: scoped.length,
    }),
    [scoped],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return scoped
      .filter((lead) => {
        if (filter === "pending") return lead.status === "pending";
        if (filter === "follow_up") return lead.status === "follow_up";
        if (filter === "done") return lead.status === "contacted" || lead.status === "closed";
        return true;
      })
      .filter(
        (lead) =>
          !needle ||
          lead.name.toLowerCase().includes(needle) ||
          lead.phone_number.includes(needle) ||
          (lead.address ?? "").toLowerCase().includes(needle) ||
          (lead.serial_no ?? "").toLowerCase().includes(needle) ||
          (lead.reference_by ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) =>
        (a.serial_no ?? "").localeCompare(b.serial_no ?? "", "bn", { numeric: true }),
      );
  }, [scoped, filter, search]);

  const openLead = leads.find((l) => l.id === openLeadId) ?? null;

  if (isPending) return <SnapshotSkeleton />;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">লিড ড্যাশবোর্ড</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            আজ {counts.pending}টি লিডে কল বাকি · {counts.follow_up}টিতে আবার যোগাযোগ করতে হবে ·{" "}
            {counts.done}টিতে কথা হয়ে গেছে
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="নাম, নম্বর, ঠিকানা খুঁজুন"
            className="pl-9"
          />
        </div>
      </div>

      <LeadQuickFilter
        leads={leads}
        period={period}
        category={category}
        onPeriodChange={setPeriod}
        onCategoryChange={(next) => {
          setCategory(next);
          // Show every matching lead, not just the ones still awaiting a call.
          if (next !== "all") setFilter("all");
        }}
        onClear={() => {
          setPeriod("all");
          setCategory("all");
        }}
      />

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="flex w-full flex-wrap">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {FILTER_LABELS[key]} ({counts[key]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Mobile: cards, no horizontal scrolling. Same rows, same data. */}
      <ul className="space-y-3 md:hidden">
        {rows.map((lead, index) => (
          <li key={lead.id} className="card-elevated w-full max-w-full overflow-hidden p-3">
            <button
              type="button"
              className="block w-full min-w-0 text-left"
              onClick={() => setOpenLeadId(lead.id)}
            >
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{lead.name}</p>
                  <p className="tabular truncate text-sm text-muted-foreground">
                    {lead.phone_number}
                  </p>
                </div>
                <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                  #{lead.serial_no ?? index + 1}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {lead.temperature && (
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                      TEMP_STYLES[lead.temperature] ?? "border-border bg-surface-2",
                    )}
                  >
                    {lead.temperature}
                  </span>
                )}
                {lead.grade && (
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-semibold">
                    গ্রেড {lead.grade}
                  </span>
                )}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    STATUS_STYLES[lead.status],
                  )}
                >
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </span>
                <span className="tabular ml-auto text-[11px] text-muted-foreground">
                  {shortDate(lead.classified_at ?? lead.last_call_at ?? lead.created_at)}
                </span>
              </div>
              {lead.address && (
                <p className="mt-1.5 truncate text-xs text-muted-foreground">{lead.address}</p>
              )}
            </button>
            <div className="mt-3 flex items-center gap-2">
              <WebCallButton
                leadId={lead.id}
                phone={lead.phone_number}
                label="কল"
                className="h-11 flex-1 text-base"
              />
              <WhatsAppAction phone={lead.phone_number} leadId={lead.id} label="" />
              <CallbackLogButton leadId={lead.id} label="" />
            </div>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            এই তালিকায় এখন কোনো লিড নেই
          </li>
        )}
      </ul>

      <div className="card-elevated hidden overflow-x-auto md:block">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">ক্রমিক</th>
              <th className="px-3 py-2.5 font-medium">নাম</th>
              <th className="px-3 py-2.5 font-medium">ঠিকানা</th>
              <th className="px-3 py-2.5 font-medium">ফোন নম্বর</th>
              <th className="px-3 py-2.5 font-medium">রেফারেন্স</th>
              <th className="px-3 py-2.5 font-medium">অবস্থা</th>
              <th className="px-3 py-2.5 font-medium">শেষ কল</th>
              <th className="px-3 py-2.5 text-right font-medium">কাজ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lead, index) => (
              <tr
                key={lead.id}
                className="border-b border-border/60 last:border-0 hover:bg-surface-2"
              >
                <td className="tabular px-3 py-2.5 text-muted-foreground">
                  {lead.serial_no ?? index + 1}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    className="text-left font-medium hover:underline"
                    onClick={() => setOpenLeadId(lead.id)}
                  >
                    {lead.name}
                  </button>
                  {lead.company && (
                    <p className="truncate text-xs text-muted-foreground">{lead.company}</p>
                  )}
                </td>
                <td className="max-w-[200px] px-3 py-2.5 text-xs text-muted-foreground">
                  {lead.address ?? "—"}
                </td>
                <td className="tabular px-3 py-2.5">{lead.phone_number}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {lead.reference_by ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                      STATUS_STYLES[lead.status],
                    )}
                  >
                    {(lead.status === "contacted" || lead.status === "closed") && (
                      <CheckCircle2 className="size-3" />
                    )}
                    {STATUS_LABELS[lead.status] ?? lead.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {lead.last_call_at
                    ? relativeTime(lead.last_call_at)
                    : `${lead.call_attempts} বার চেষ্টা`}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    <WebCallButton
                      leadId={lead.id}
                      phone={lead.phone_number}
                      label="কল"
                      className="h-9 flex-none text-sm"
                    />
                    <CallbackLogButton leadId={lead.id} label="" />
                    <WhatsAppAction phone={lead.phone_number} leadId={lead.id} label="" />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  এই তালিকায় এখন কোনো লিড নেই
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <LeadDossier
        lead={openLead}
        agents={profiles}
        timeline={openLead ? buildTimeline(calls, messages, openLead.id, events) : []}
        open={openLeadId !== null}
        onOpenChange={(next) => !next && setOpenLeadId(null)}
      />
    </section>
  );
}
