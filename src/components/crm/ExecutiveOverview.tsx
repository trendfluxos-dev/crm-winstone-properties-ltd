import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HeartHandshake,
  PhoneCall,
  Timer,
  Trophy,
} from "lucide-react";
import { useEffect, useState } from "react";

import { formatTalkTime } from "@/lib/crm-format";
import { getTeamDailyPerformance } from "@/lib/daily-performance.functions";
import type { TeamDailyRow } from "@/lib/daily-performance.server";
import { useAdminToken } from "@/lib/local-session";

/**
 * Executive HQ first screen.
 *
 * Everything here comes from one `getTeamDailyPerformance` call — the same
 * Dhaka-day server counters the agent and coordinator cards use. Nothing is
 * recomputed with a second definition, nothing is scored, nothing is invented:
 * a floor with no calls today shows real zeros with one honest empty state.
 */

const SECTION_LINKS = [
  { id: "hq-daily", label: "আজকের পারফরম্যান্স" },
  { id: "hq-top3", label: "Top 3" },
  { id: "hq-agents", label: "এজেন্ট রিপোর্ট" },
  { id: "hq-ai", label: "Ask Winstone AI" },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Dhaka wall-clock date and time, refreshed every minute. */
function useDhakaNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(now);
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

export function ExecutiveOverview() {
  const adminToken = useAdminToken();
  const fetchTeam = useServerFn(getTeamDailyPerformance);
  const online = useOnline();
  const dhakaNow = useDhakaNow();

  const { data, isPending, isFetching, isError, dataUpdatedAt } = useQuery({
    queryKey: ["team-daily-performance", adminToken ?? "account"],
    queryFn: () => fetchTeam({ data: { adminToken: adminToken ?? null } }),
    refetchInterval: 60_000,
  });

  const totals = data?.totals;
  const rows = data?.agents ?? [];
  const hasActivity = Boolean(
    totals && (totals.callsMade > 0 || totals.reportsSubmitted > 0 || totals.followUpsDue > 0),
  );
  const lastUpdated = dataUpdatedAt
    ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", timeStyle: "short" }).format(
        new Date(dataUpdatedAt),
      )
    : "—";

  const status = !online
    ? { label: "Offline", tone: "text-destructive", dot: "bg-destructive" }
    : isFetching
      ? { label: "Syncing", tone: "text-warning", dot: "bg-warning" }
      : { label: "Online", tone: "text-live", dot: "bg-live" };

  // Ranking is a plain ordering of the real counters, not a score: most
  // connected calls first, then calls made, then talk time.
  const top3 = [...rows]
    .sort(
      (a, b) =>
        b.connected - a.connected || b.callsMade - a.callsMade || b.talkSeconds - a.talkSeconds,
    )
    .filter((a) => a.callsMade > 0 || a.reportsSubmitted > 0)
    .slice(0, 3);

  const connectedRate =
    totals && totals.callsMade > 0 ? Math.round((totals.connected / totals.callsMade) * 100) : null;

  return (
    <div className="space-y-5">
      {/* Command header — sticky on mobile so the live state stays visible. */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-border bg-background/90 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:px-5 sm:py-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Winstone Connect</p>
            <h1 className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              Executive HQ
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {dhakaNow} · সর্বশেষ আপডেট {lastUpdated}
            </p>
          </div>
          <span
            className={`flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}
          >
            <span className={`size-2 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        <nav className="mt-3 flex flex-wrap gap-2">
          {SECTION_LINKS.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToSection(link.id)}
              className="min-h-11 rounded-full border border-border px-3 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-surface-2 sm:min-h-0 sm:py-1.5"
            >
              {link.label}
            </button>
          ))}
        </nav>
      </header>

      {isError ? (
        <p className="text-sm text-destructive">ফ্লোরের হিসাব আনা যায়নি।</p>
      ) : (
        <>
          {/* KPI row — today's real floor numbers. */}
          <section id="hq-daily" className="scroll-mt-24 space-y-3">
            <p className="eyebrow">আজকের পারফরম্যান্স · Daily Performance</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
              <Kpi
                icon={<PhoneCall className="size-4" />}
                label="কল করা"
                value={isPending ? null : String(totals?.callsMade ?? 0)}
              />
              <Kpi
                icon={<CheckCircle2 className="size-4" />}
                label="সংযুক্ত"
                value={isPending ? null : String(totals?.connected ?? 0)}
              />
              <Kpi
                icon={<HeartHandshake className="size-4" />}
                label="আগ্রহী"
                value={isPending ? null : String(totals?.interested ?? 0)}
              />
              <Kpi
                icon={<Clock3 className="size-4" />}
                label="ফলো-আপ বাকি"
                value={isPending ? null : String(totals?.followUpsDue ?? 0)}
              />
              <Kpi
                icon={<ClipboardCheck className="size-4" />}
                label="রিপোর্ট জমা"
                value={isPending ? null : String(totals?.reportsSubmitted ?? 0)}
              />
              <Kpi
                icon={<Timer className="size-4" />}
                label="কথার সময়"
                value={isPending ? null : formatTalkTime(totals?.talkSeconds ?? 0)}
              />
            </div>
            {!isPending && !hasActivity && <TodayEmptyState lastUpdated={lastUpdated} />}
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Top 3 — directly under the KPI row. */}
            <section id="hq-top3" className="scroll-mt-24 space-y-3">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Daily Top 3</p>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Trophy className="size-4 text-primary" /> আজকের সেরা ৩ পারফরমার
                  </h2>
                </div>
              </div>
              {isPending ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="skeleton h-20" />
                  ))}
                </div>
              ) : top3.length === 0 ? (
                <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
                  আজ এখনো কোনো এজেন্টের কল বা রিপোর্ট জমা হয়নি, তাই তালিকা খালি।
                </p>
              ) : (
                <ol className="space-y-2">
                  {top3.map((agent, index) => (
                    <TopAgentRow key={agent.agentId} rank={index + 1} agent={agent} />
                  ))}
                </ol>
              )}
            </section>

            {/* Floor summary — same totals, read as a sentence. */}
            <section className="space-y-3">
              <p className="eyebrow">Executive Summary</p>
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <Activity className="size-4 text-primary" /> আজকের ফ্লোর সারাংশ
                </h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <SummaryLine label="সক্রিয় এজেন্ট" value={String(totals?.agents ?? 0)} />
                  <SummaryLine label="মোট কল" value={String(totals?.callsMade ?? 0)} />
                  <SummaryLine
                    label="সংযুক্ত হার"
                    value={connectedRate === null ? "তথ্য নেই" : `${connectedRate}%`}
                  />
                  <SummaryLine label="আগ্রহী লিড" value={String(totals?.interested ?? 0)} />
                  <SummaryLine label="ফলো-আপ বাকি" value={String(totals?.followUpsDue ?? 0)} />
                  <SummaryLine label="রিপোর্ট জমা" value={String(totals?.reportsSubmitted ?? 0)} />
                  <SummaryLine
                    label="মোট কথার সময়"
                    value={formatTalkTime(totals?.talkSeconds ?? 0)}
                  />
                  <SummaryLine
                    label="রিপোর্ট বকেয়া"
                    value={
                      totals?.pendingReports
                        ? `${totals.pendingReports} জন এজেন্ট`
                        : "কারও বকেয়া নেই"
                    }
                  />
                </dl>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  {totals
                    ? hasActivity
                      ? `${totals.agents} জন এজেন্টের মধ্যে আজ ${totals.callsMade}টি কল হয়েছে, ${totals.connected}টিতে কথা হয়েছে এবং ${totals.reportsSubmitted}টি রিপোর্ট জমা পড়েছে।`
                      : "আজকের দিনের কোনো কল বা রিপোর্ট এখনো রেকর্ড হয়নি।"
                    : "হিসাব লোড হচ্ছে…"}
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

/** One honest zero-data message, reused instead of repeating it per section. */
export function TodayEmptyState({ lastUpdated }: { lastUpdated: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-4 text-sm">
      <p className="font-medium">আজ এখনো কোনো সক্রিয় এজেন্টের রেকর্ড পাওয়া যায়নি।</p>
      <p className="mt-1 text-xs text-muted-foreground">শেষ সিঙ্ক: {lastUpdated}</p>
      <p className="text-xs text-muted-foreground">
        নতুন কল বা রিপোর্ট এলে এই ড্যাশবোর্ড নিজে থেকেই আপডেট হবে।
      </p>
    </div>
  );
}

function TopAgentRow({ rank, agent }: { rank: number; agent: TeamDailyRow }) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">
          #{rank}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{agent.agentName}</p>
          <p className="truncate text-xs text-muted-foreground tabular">
            {agent.employeeId ?? "কর্মী আইডি নেই"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            agent.pendingReport
              ? "border-warning/40 text-warning"
              : "border-live/40 text-live"
          }`}
        >
          {agent.pendingReport ? "রিপোর্ট বাকি" : "সিঙ্ক ঠিক"}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Metric label="কল" value={agent.callsMade} />
        <Metric label="সংযুক্ত" value={agent.connected} />
        <Metric label="আগ্রহী" value={agent.interested} />
        <Metric label="ফলো-আপ" value={agent.followUpsDue} />
        <Metric label="রিপোর্ট" value={agent.reportsSubmitted} />
        <span>
          কথার সময় <span className="tabular font-semibold text-foreground">
            {formatTalkTime(agent.talkSeconds)}
          </span>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {agent.callsMade}টি কলের মধ্যে {agent.connected}টিতে কথা হয়েছে, {agent.reportsSubmitted}টি
        রিপোর্ট জমা।
      </p>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <span className="tabular font-semibold text-foreground">{value}</span>
    </span>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-semibold">{value}</dd>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </p>
      {value === null ? (
        <div className="skeleton mt-3 h-8 w-16" />
      ) : (
        <p className="tabular mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{value}</p>
      )}
    </div>
  );
}
