import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListTree } from "lucide-react";

import { useAdminToken } from "@/lib/local-session";
import { leadPoolBreakdown, type LeadPoolTally } from "@/lib/lead-pool.functions";

/**
 * What the head-office lead database holds, summarised for the IT Console:
 * quality, sector and area counts of the leads still waiting to be handed out.
 * Counts only — no customer contact detail is rendered here.
 */
export function LeadDatabaseSummary() {
  const adminToken = useAdminToken();
  const breakdownFn = useServerFn(leadPoolBreakdown);

  const summary = useQuery({
    queryKey: ["lead-pool-breakdown", adminToken ? "pin" : "session"],
    queryFn: () => breakdownFn({ data: { adminToken } }),
    refetchInterval: 120_000,
  });

  const data = summary.data;

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <ListTree className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">লিড ডেটাবেজের সারসংক্ষেপ</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {data ? `মোট ${data.total}টি · অপেক্ষায় ${data.pool}টি · দেওয়া হয়েছে ${data.assigned}টি` : "…"}
        </span>
      </header>

      {data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <TallyList title="মান" rows={data.quality} total={data.pool} />
          <TallyList title="খাত" rows={data.sectors} total={data.pool} />
          <TallyList title="এলাকা" rows={data.areas} total={data.pool} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {summary.isPending ? "হিসাব আসছে…" : "এখনো কোনো লিড নেই।"}
        </p>
      )}
    </section>
  );
}

function TallyList({
  title,
  rows,
  total,
}: {
  title: string;
  rows: LeadPoolTally[];
  total: number;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.length === 0 ? <li className="text-xs text-muted-foreground">তথ্য নেই</li> : null}
        {rows.map((row) => (
          <li key={row.label} className="flex items-baseline justify-between gap-3">
            <span className="truncate">{row.label}</span>
            <span className="tabular text-xs text-muted-foreground">
              {row.count}
              {total > 0 ? ` · ${Math.round((row.count / total) * 100)}%` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
