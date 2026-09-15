import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Lead } from "@/lib/crm-data";

export type LeadPeriod = "today" | "7d" | "month" | "all";
export type LeadCategory = "all" | "hot" | "warm" | "cold" | "A" | "B" | "C" | "D" | "follow_up";

export const PERIOD_OPTIONS: { key: LeadPeriod; label: string }[] = [
  { key: "today", label: "আজ" },
  { key: "7d", label: "গত ৭ দিন" },
  { key: "month", label: "এই মাস" },
  { key: "all", label: "সব লিড" },
];

const CATEGORY_OPTIONS: { key: LeadCategory; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "cold", label: "Cold" },
  { key: "A", label: "A" },
  { key: "B", label: "B" },
  { key: "C", label: "C" },
  { key: "D", label: "D" },
  { key: "follow_up", label: "ফলো-আপ" },
];

/** Day key in Dhaka time, so "today" means today for the agent, not UTC. */
function dhakaDayKey(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The date a lead "belongs to" for the agent: when it was classified, else the
 * last call, else the work day it was handed out, else when it was created.
 */
function leadDayKey(lead: Lead): string {
  const stamp = lead.classified_at ?? lead.last_call_at ?? null;
  if (stamp) return dhakaDayKey(stamp);
  if (lead.work_date) return lead.work_date;
  return dhakaDayKey(lead.created_at);
}

export function matchesPeriod(lead: Lead, period: LeadPeriod): boolean {
  if (period === "all") return true;
  const today = dhakaDayKey(new Date());
  const day = leadDayKey(lead);
  if (period === "today") return day === today;
  if (period === "month") return day.slice(0, 7) === today.slice(0, 7);
  const from = dhakaDayKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  return day >= from && day <= today;
}

export function matchesCategory(lead: Lead, category: LeadCategory): boolean {
  if (category === "all") return true;
  if (category === "follow_up") return lead.status === "follow_up";
  if (category === "hot" || category === "warm" || category === "cold") {
    return lead.temperature === category;
  }
  return lead.grade === category;
}

/**
 * Compact mobile-first filter bar for the agent lead list. Reuses the existing
 * temperature/grade fields — no new classification system.
 */
export function LeadQuickFilter({
  leads,
  period,
  category,
  onPeriodChange,
  onCategoryChange,
  onClear,
}: {
  leads: Lead[];
  period: LeadPeriod;
  category: LeadCategory;
  onPeriodChange: (next: LeadPeriod) => void;
  onCategoryChange: (next: LeadCategory) => void;
  onClear: () => void;
}) {
  const inPeriod = leads.filter((lead) => matchesPeriod(lead, period));
  const dirty = period !== "today" || category !== "all";

  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface-2 p-2.5">
      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">
          সময়
        </span>
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.key}
            size="sm"
            variant={period === option.key ? "default" : "outline"}
            className="h-9 shrink-0 rounded-full px-3 text-xs"
            onClick={() => onPeriodChange(option.key)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase text-muted-foreground">
          ক্যাটাগরি
        </span>
        {CATEGORY_OPTIONS.map((option) => {
          const count = inPeriod.filter((lead) => matchesCategory(lead, option.key)).length;
          return (
            <Button
              key={option.key}
              size="sm"
              variant={category === option.key ? "default" : "outline"}
              className="h-9 shrink-0 rounded-full px-3 text-xs"
              onClick={() => onCategoryChange(option.key)}
            >
              {option.label} ({count})
            </Button>
          );
        })}
        {dirty && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 shrink-0 gap-1 rounded-full px-3 text-xs"
            onClick={onClear}
          >
            <X className="size-3.5" /> ফিল্টার মুছুন
          </Button>
        )}
      </div>
    </div>
  );
}
