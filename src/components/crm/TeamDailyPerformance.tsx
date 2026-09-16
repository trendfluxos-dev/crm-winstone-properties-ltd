import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";

import { formatTalkTime } from "@/lib/crm-format";
import { getTeamDailyPerformance } from "@/lib/daily-performance.functions";
import { useAdminToken } from "@/lib/local-session";

/**
 * Team-level "আজকের কাজ" for the Coordinator Deck and floor-level for
 * Executive HQ. Same server counters the agent's own card uses, aggregated per
 * agent — no second definition of connected/interested/talk time, no scores,
 * and no phone numbers (supervision surfaces never need them).
 */
export function TeamDailyPerformance({ title = "টিমের আজকের কাজ" }: { title?: string }) {
  const adminToken = useAdminToken();
  const fetchTeam = useServerFn(getTeamDailyPerformance);

  const { data, isPending, isError } = useQuery({
    queryKey: ["team-daily-performance", adminToken ?? "account"],
    queryFn: () => fetchTeam({ data: { adminToken: adminToken ?? null } }),
    refetchInterval: 60_000,
  });

  const totals = data?.totals;

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Daily Performance</p>
          <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold tracking-tight">
            <Users className="size-4 text-primary" /> {title}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ঢাকা সময়ের আজকের দিন — প্রতিটি সংখ্যা সার্ভারের আসল রেকর্ড থেকে।
          </p>
        </div>
        {totals && (
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
            {totals.agents} জন এজেন্ট
            {totals.pendingReports > 0 ? ` · ${totals.pendingReports} রিপোর্ট বাকি` : ""}
          </span>
        )}
      </div>

      {isError ? (
        <p className="mt-4 text-sm text-destructive">টিমের হিসাব আনা যায়নি।</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="কল করা" value={isPending ? null : totals?.callsMade} />
            <Tile label="সংযুক্ত" value={isPending ? null : totals?.connected} />
            <Tile label="আগ্রহী" value={isPending ? null : totals?.interested} />
            <Tile label="ফলো-আপ বাকি" value={isPending ? null : totals?.followUpsDue} />
            <Tile label="রিপোর্ট জমা" value={isPending ? null : totals?.reportsSubmitted} />
            <Tile
              label="কথা বলার সময়"
              text={isPending ? null : formatTalkTime(totals?.talkSeconds ?? 0)}
            />
          </div>

          {data && data.agents.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3">এজেন্ট</th>
                    <th className="py-1.5 pr-3">কর্মী আইডি</th>
                    <th className="py-1.5 pr-3">কল</th>
                    <th className="py-1.5 pr-3">সংযুক্ত</th>
                    <th className="py-1.5 pr-3">আগ্রহী</th>
                    <th className="py-1.5 pr-3">ফলো-আপ</th>
                    <th className="py-1.5 pr-3">রিপোর্ট</th>
                    <th className="py-1.5">কথার সময়</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((a) => (
                    <tr key={a.agentId} className="border-t border-border/60">
                      <td className="py-1.5 pr-3 font-medium">{a.agentName}</td>
                      <td className="py-1.5 pr-3 tabular">{a.employeeId ?? "—"}</td>
                      <td className="py-1.5 pr-3 tabular">{a.callsMade}</td>
                      <td className="py-1.5 pr-3 tabular">{a.connected}</td>
                      <td className="py-1.5 pr-3 tabular">{a.interested}</td>
                      <td className="py-1.5 pr-3 tabular">{a.followUpsDue}</td>
                      <td className="py-1.5 pr-3 tabular">{a.reportsSubmitted}</td>
                      <td className="py-1.5 tabular">{formatTalkTime(a.talkSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !isPending ? (
            <p className="mt-4 text-sm text-muted-foreground">
              আজ কোনো সক্রিয় এজেন্টের রেকর্ড নেই।
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  text,
}: {
  label: string;
  value?: number | null;
  text?: string | null;
}) {
  const shown = text ?? (value === null || value === undefined ? null : String(value));
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular">{shown ?? "—"}</p>
    </div>
  );
}
