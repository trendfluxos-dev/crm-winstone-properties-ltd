import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { generateShiftSummaryNow, shiftSummaries } from "@/lib/shift-summary.functions";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

function dhaka(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
}

/**
 * Shift summaries built from the agents' own updates.
 * HQ shows the rolling month; the IT Console shows the full archive.
 */
export function ShiftSummaryPanel({ scope }: { scope: "hq" | "it" }) {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const load = useServerFn(shiftSummaries);
  const generate = useServerFn(generateShiftSummaryNow);

  const list = useQuery({
    queryKey: ["shift-summaries", scope],
    queryFn: () => load({ data: { adminToken: adminToken ?? null, scope } }),
    refetchInterval: 120_000,
  });

  const run = useMutation({
    mutationFn: () => generate({ data: { adminToken: getAdminToken() } }),
    onSuccess: () => {
      toast.success("সামারি তৈরি হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["shift-summaries"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data?.rows ?? [];

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">
          শিফট সামারি {scope === "hq" ? "(চলতি মাস)" : "(সম্পূর্ণ সংরক্ষণ)"}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length}টি</span>
        {scope === "it" && (
          <Button size="sm" variant="secondary" disabled={run.isPending} onClick={() => run.mutate()}>
            {run.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            এখনই তৈরি
          </Button>
        )}
      </header>

      <p className="mt-1 text-xs text-muted-foreground">
        ১২:৫০ ও ৫:৩০-এ স্বয়ংক্রিয়ভাবে তৈরি হয় — এজেন্টদের দেওয়া আপডেট অনুযায়ী।
        {scope === "hq" && " প্রতি মাসের ৫ তারিখে এখান থেকে সরে যায়, আইটি কনসোলে সব থাকে।"}
      </p>

      {list.isPending && <p className="mt-3 text-sm text-muted-foreground">সামারি আনা হচ্ছে…</p>}
      {!list.isPending && rows.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">এখনো কোনো শিফট সামারি নেই।</p>
      )}

      <div className="mt-3 space-y-4">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{row.shift_label}</p>
              <span className="text-xs text-muted-foreground">{dhaka(row.window_end)}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                কল {row.totals.called} · সংযুক্ত {row.totals.connected} · আপডেট {row.totals.reports} · বাকি{" "}
                {row.totals.pending} · ফলো-আপ {row.totals.followUps}
              </span>
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 pr-3">এজেন্ট</th>
                    <th className="py-1.5 pr-3">লিড</th>
                    <th className="py-1.5 pr-3">কল</th>
                    <th className="py-1.5 pr-3">ধরেছে</th>
                    <th className="py-1.5 pr-3">আপডেট</th>
                    <th className="py-1.5">ক্যাটাগরি</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {row.agents.map((agent) => (
                    <tr key={agent.agentId}>
                      <td className="py-1.5 pr-3">
                        {agent.name}
                        {agent.employeeId ? (
                          <span className="ml-1 text-xs text-muted-foreground">{agent.employeeId}</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3 tabular">{agent.assigned}</td>
                      <td className="py-1.5 pr-3 tabular">{agent.called}</td>
                      <td className="py-1.5 pr-3 tabular">{agent.connected}</td>
                      <td className="py-1.5 pr-3 tabular">
                        {agent.reports}
                        {agent.pending ? (
                          <span className="ml-1 text-xs text-destructive">({agent.pending} বাকি)</span>
                        ) : null}
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {Object.entries(agent.categories)
                          .map(([label, count]) => `${label} ${count}`)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
