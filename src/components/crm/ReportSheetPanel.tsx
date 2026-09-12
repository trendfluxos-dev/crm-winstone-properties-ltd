import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, ExternalLink, Loader2, RefreshCw, Table2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { downloadCsv, toCsv } from "@/lib/crm-reports";
import { useAdminToken } from "@/lib/local-session";
import { pushReportSheet, reportSheet } from "@/lib/report-sheet.functions";

const DEADLINE_HOUR = 17;
const DEADLINE_MINUTE = 20;

/** Dhaka (UTC+6) wall clock, regardless of the viewer's device timezone. */
function dhakaNow() {
  const now = new Date();
  return new Date(now.getTime() + (6 * 60 + now.getTimezoneOffset()) * 60_000);
}

function dhakaTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
}

/**
 * IT Console report sheet: every submitted agent call report as a spreadsheet,
 * downloadable as CSV and pushed into the workspace Google Sheet. Sync runs on
 * demand and automatically once the 5:20 PM (Dhaka) cut-off has passed.
 */
export function ReportSheetPanel() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fetchSheet = useServerFn(reportSheet);
  const push = useServerFn(pushReportSheet);
  const autoTried = useRef(false);

  const sheet = useQuery({
    queryKey: ["report-sheet", adminToken ? "pin" : "session"],
    queryFn: () => fetchSheet({ data: { adminToken, limit: 200 } }),
    refetchInterval: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => push({ data: { adminToken } }),
    onSuccess: (result) => {
      toast.success(
        result.appended > 0
          ? `${result.appended}টি রিপোর্ট Google Sheet-এ জমা হলো`
          : "নতুন কোনো রিপোর্ট বাকি নেই",
      );
      void queryClient.invalidateQueries({ queryKey: ["report-sheet"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = sheet.data?.rows ?? [];
  const header = sheet.data?.header ?? [];
  const lastSyncedAt = sheet.data?.sync.lastSyncedAt ?? null;

  const local = dhakaNow();
  const pastCutOff =
    local.getHours() > DEADLINE_HOUR ||
    (local.getHours() === DEADLINE_HOUR && local.getMinutes() >= DEADLINE_MINUTE);
  const syncedToday = lastSyncedAt
    ? new Date(new Date(lastSyncedAt).getTime() + 6 * 3600_000).toDateString() ===
      local.toDateString()
    : false;

  // After the daily 5:20 PM cut-off, the first IT Console view pushes the day's
  // reports to the sheet by itself; the server keeps this idempotent.
  useEffect(() => {
    if (autoTried.current || !sheet.data || !pastCutOff || syncedToday || sync.isPending) return;
    autoTried.current = true;
    sync.mutate();
  }, [sheet.data, pastCutOff, syncedToday, sync]);

  const exportCsv = () => {
    const csv = toCsv(
      header,
      rows.map((r) => [
        dhakaTime(r.callEndedAt),
        r.agentName,
        r.leadName,
        r.phone,
        r.category,
        r.connected ? "হ্যাঁ" : "না",
        r.durationSeconds,
        r.summary,
        r.note,
        dhakaTime(r.followUpAt),
      ]),
    );
    downloadCsv(`winstone-call-reports-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <Table2 className="size-4 text-primary" /> রিপোর্ট শিট
          </h2>
          <p className="text-xs text-muted-foreground">
            এজেন্টদের জমা দেওয়া প্রতিটি কল রিপোর্ট — প্রতিদিন বিকেল ৫:২০-এর পর নিজে থেকেই Google
            Sheet-এ জমা হয়। সর্বশেষ জমা: {dhakaTime(lastSyncedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{rows.length}টি রিপোর্ট</Badge>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-3.5" /> স্প্রেডশিট নামান
          </Button>
          <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            {sync.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
            Google Sheet-এ পাঠান
          </Button>
          {sheet.data?.sheetUrl ? (
            <Button size="sm" variant="ghost" asChild>
              <a href={sheet.data.sheetUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" /> শিট খুলুন
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      {sheet.isLoading ? (
        <p className="text-xs text-muted-foreground">লোড হচ্ছে…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
          এখনো কোনো জমা দেওয়া কল রিপোর্ট নেই।
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                {header.map((h) => (
                  <th key={h} className="whitespace-nowrap px-2 py-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="whitespace-nowrap px-2 py-2">{dhakaTime(r.callEndedAt)}</td>
                  <td className="whitespace-nowrap px-2 py-2 font-medium">{r.agentName}</td>
                  <td className="px-2 py-2">{r.leadName}</td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">{r.phone}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <Badge variant="outline">{r.category}</Badge>
                  </td>
                  <td className="px-2 py-2">{r.connected ? "হ্যাঁ" : "না"}</td>
                  <td className="px-2 py-2 tabular-nums">{r.durationSeconds}</td>
                  <td className="max-w-[240px] px-2 py-2">{r.summary || "—"}</td>
                  <td className="max-w-[220px] px-2 py-2">{r.note || "—"}</td>
                  <td className="whitespace-nowrap px-2 py-2">{dhakaTime(r.followUpAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
