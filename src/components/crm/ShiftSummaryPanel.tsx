import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarClock,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ShiftSummaryRow } from "@/lib/shift-summary.server";
import type { ShiftSheet } from "@/lib/shift-summary.server";
import {
  backfillShiftSummariesNow,
  generateShiftSummaryNow,
  liveShiftSheetNow,
  exportShiftSummaryToDrive,
  shiftSummaries,
} from "@/lib/shift-summary.functions";
import { supabase } from "@/integrations/supabase/client";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

function dhaka(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
}

const EXPORT_HEADER = [
  "শিফট",
  "উইন্ডো শেষ",
  "এজেন্ট",
  "আইডি",
  "অ্যাসাইন লিড",
  "কল",
  "ধরেছে",
  "আপডেট",
  "বাকি",
  "ফলো-আপ",
  "ক্যাটাগরি",
];

function csvCell(value: string | number) {
  const text = String(value ?? "");
  // Keep spreadsheet formulas inert.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** One CSV of the given summaries, one line per agent per shift. */
function buildCsv(rows: ShiftSummaryRow[]) {
  const lines = [EXPORT_HEADER.map(csvCell).join(",")];
  for (const row of rows) {
    for (const agent of row.agents) {
      lines.push(
        [
          row.shift_label,
          dhaka(row.window_end),
          agent.name,
          agent.employeeId ?? "",
          agent.assigned,
          agent.called,
          agent.connected,
          agent.reports,
          agent.pending,
          agent.followUps,
          Object.entries(agent.categories)
            .map(([label, count]) => `${label} ${count}`)
            .join(" | "),
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `\ufeff${lines.join("\r\n")}`;
}

function downloadCsv(rows: ShiftSummaryRow[], fileName: string) {
  if (rows.length === 0) {
    toast.error("এক্সপোর্ট করার মতো কিছু নেই");
    return;
  }
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("সামারি ফাইল নামানো হয়েছে");
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

  const loadLive = useServerFn(liveShiftSheetNow);
  const backfill = useServerFn(backfillShiftSummariesNow);

  const live = useQuery({
    queryKey: ["shift-summary-live"],
    queryFn: () => loadLive({ data: { adminToken: adminToken ?? null } }),
    // Falls back to a slow poll; realtime below is what keeps it instant.
    refetchInterval: 30_000,
    enabled: scope === "it",
  });

  // An update an agent submits right now must land on this sheet immediately.
  useEffect(() => {
    if (scope !== "it") return;
    const channel = supabase
      .channel("shift-summary-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_reports" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["shift-summary-live"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "follow_up_events" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["shift-summary-live"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_summaries" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["shift-summaries"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, scope]);

  const list = useQuery({
    queryKey: ["shift-summaries", scope],
    queryFn: () => load({ data: { adminToken: adminToken ?? null, scope } }),
    refetchInterval: 120_000,
  });

  const driveLinks = list.data?.driveLinks ?? {};
  const toDrive = useServerFn(exportShiftSummaryToDrive);
  const pushDrive = useMutation({
    mutationFn: (shiftKey: string) =>
      toDrive({ data: { adminToken: adminToken ?? null, shiftKey } }),
    onSuccess: () => {
      toast.success("Drive ফোল্ডারে জমা হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["shift-summaries"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const fill = useMutation({
    mutationFn: () => backfill({ data: { adminToken: getAdminToken() } }),
    onSuccess: (result) => {
      const count = (result as { written: string[] }).written.length;
      toast.success(count ? `${count}টি পুরোনো শিফট যোগ হয়েছে` : "যোগ করার মতো পুরোনো আপডেট নেই");
      void queryClient.invalidateQueries({ queryKey: ["shift-summaries"] });
    },
    onError: (error: Error) => toast.error(error.message),
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
  const liveSheet = live.data as ShiftSheet | undefined;
  const liveRow: ShiftSummaryRow | null = liveSheet
    ? {
        id: liveSheet.shiftKey,
        shift_key: liveSheet.shiftKey,
        shift_label: `${liveSheet.shiftLabel} — ${liveSheet.live ? "চলমান (লাইভ)" : "সর্বশেষ উইন্ডো"}`,
        window_start: liveSheet.windowStart,
        window_end: liveSheet.windowEnd,
        generated_at: liveSheet.generatedAt,
        hq_visible: false,
        totals: liveSheet.totals,
        agents: liveSheet.agents,
      }
    : null;

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">
          শিফট সামারি {scope === "hq" ? "(চলতি মাস)" : "(সম্পূর্ণ সংরক্ষণ)"}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">{rows.length}টি</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            downloadCsv(rows, `winstone-shift-summary-${new Date().toISOString().slice(0, 10)}.csv`)
          }
        >
          <Download className="size-4" />
          সব এক্সপোর্ট
        </Button>
        {scope === "it" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={run.isPending}
              onClick={() => run.mutate()}
            >
              {run.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              এখনই তৈরি
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={fill.isPending}
              onClick={() => fill.mutate()}
            >
              {fill.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              পুরোনো দিন যোগ করুন
            </Button>
          </>
        )}
      </header>

      <p className="mt-1 text-xs text-muted-foreground">
        ১২:৫০ ও ৫:৩০-এ স্বয়ংক্রিয়ভাবে তৈরি ও এক্সপোর্টের জন্য প্রস্তুত হয় — এজেন্টদের দেওয়া
        আপডেট অনুযায়ী।
        {scope === "hq" && " প্রতি মাসের ৫ তারিখে এখান থেকে সরে যায়, আইটি কনসোলে সব থাকে।"}
      </p>

      {scope === "it" && liveRow && (
        <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {liveSheet?.live ? "লাইভ শিট" : "সর্বশেষ উইন্ডো"}
            </span>
            <p className="text-sm font-semibold">{liveSheet?.shiftLabel}</p>
            <span className="ml-auto text-xs text-muted-foreground">
              কল {liveRow.totals.called} · ধরেছে {liveRow.totals.connected} · আপডেট{" "}
              {liveRow.totals.reports} · বাকি {liveRow.totals.pending}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() =>
                downloadCsv(
                  [liveRow],
                  `winstone-shift-live-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }
            >
              <Download className="size-3" />
              CSV
            </Button>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-3">এজেন্ট</th>
                  <th className="py-1.5 pr-3">কল</th>
                  <th className="py-1.5 pr-3">ধরেছে</th>
                  <th className="py-1.5 pr-3">আপডেট</th>
                  <th className="py-1.5">ক্যাটাগরি</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {liveRow.agents.map((agent) => (
                  <tr key={agent.agentId}>
                    <td className="py-1.5 pr-3">{agent.name}</td>
                    <td className="py-1.5 pr-3 tabular">{agent.called}</td>
                    <td className="py-1.5 pr-3 tabular">{agent.connected}</td>
                    <td className="py-1.5 pr-3 tabular">
                      {agent.reports}
                      {agent.pending ? (
                        <span className="ml-1 text-xs text-destructive">
                          ({agent.pending} বাকি)
                        </span>
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
          <p className="mt-1 text-xs text-muted-foreground">
            এজেন্ট আপডেট জমা দিলেই এই শিট সাথে সাথে বদলায়। শিফট শেষে এটিই সংরক্ষিত সামারি হয়ে
            যায়।
          </p>
        </div>
      )}

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
                কল {row.totals.called} · সংযুক্ত {row.totals.connected} · আপডেট {row.totals.reports}{" "}
                · বাকি {row.totals.pending} · ফলো-আপ {row.totals.followUps}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => downloadCsv([row], `winstone-shift-${row.shift_key}.csv`)}
              >
                <Download className="size-3" />
                CSV
              </Button>
              {driveLinks[row.shift_key] ? (
                <a
                  href={driveLinks[row.shift_key]}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3" />
                  Drive
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-xs"
                  disabled={pushDrive.isPending}
                  onClick={() => pushDrive.mutate(row.shift_key)}
                >
                  <UploadCloud className="size-3" />
                  Drive-এ জমা দিন
                </Button>
              )}
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
                          <span className="ml-1 text-xs text-muted-foreground">
                            {agent.employeeId}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-1.5 pr-3 tabular">{agent.assigned}</td>
                      <td className="py-1.5 pr-3 tabular">{agent.called}</td>
                      <td className="py-1.5 pr-3 tabular">{agent.connected}</td>
                      <td className="py-1.5 pr-3 tabular">
                        {agent.reports}
                        {agent.pending ? (
                          <span className="ml-1 text-xs text-destructive">
                            ({agent.pending} বাকি)
                          </span>
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
