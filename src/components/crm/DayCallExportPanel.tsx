import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileAudio, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { dayCallExport, type DayCallRow } from "@/lib/day-export.functions";
import { getAdminToken } from "@/lib/local-session";
import { recordingDocSync } from "@/lib/recording-doc.functions";

const HEADER = [
  "সময় (ঢাকা)",
  "এজেন্ট",
  "আইডি",
  "লিড",
  "নম্বর",
  "উৎস",
  "ধরন",
  "কল অবস্থা",
  "সময় (সেকেন্ড)",
  "সময় (মি:সে)",
  "কথা হয়েছে",
  "রেকর্ডিং অবস্থা",
  "রেকর্ডিং লিংক (সাইন করা)",
  "ট্রান্সক্রিপ্ট",
  "ক্যাটাগরি",
  "সারসংক্ষেপ",
];

function csvCell(value: string | number) {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function buildCsv(rows: DayCallRow[]) {
  const lines = [HEADER.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.atDhaka,
        row.agentName,
        row.employeeId ?? "",
        row.leadName,
        row.phone,
        row.source,
        row.direction,
        row.callStatus,
        row.durationSeconds,
        row.durationLabel,
        row.connected ? "হ্যাঁ" : "না",
        row.recordingStatus,
        row.audioUrl ?? "রেকর্ডিং নেই",
        row.transcript ? "আছে" : "নেই",
        row.category,
        row.summary,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return `\ufeff${lines.join("\r\n")}`;
}

function todayDhaka() {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

type Result = Awaited<ReturnType<typeof dayCallExport>>;

/**
 * One-day audit export: every call of that Dhaka day with a signed recording
 * link, so the call count and talk time can be checked against the audio.
 */
export function DayCallExportPanel() {
  const run = useServerFn(dayCallExport);
  const [dateKey, setDateKey] = useState(todayDhaka());
  const [result, setResult] = useState<Result | null>(null);
  const syncDoc = useServerFn(recordingDocSync);
  const [docLink, setDocLink] = useState<string | null>(null);

  const toDoc = useMutation({
    mutationFn: () => syncDoc({ data: { adminToken: getAdminToken(), dateKey } }),
    onSuccess: (data) => {
      setDocLink(data.docUrl);
      toast.success(`${data.calls}টি কল · ${data.recordings}টি রেকর্ডিং Google Doc-এ লেখা হয়েছে`);
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const build = useMutation({
    mutationFn: () => run({ data: { adminToken: getAdminToken(), dateKey } }),
    onSuccess: (data) => {
      setResult(data);
      if (data.calls.length === 0) {
        toast.info("এই দিনে কোনো কল পাওয়া যায়নি");
        return;
      }
      const blob = new Blob([buildCsv(data.calls)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `winstone-calls-${data.dateKey}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`${data.calls.length}টি কল · ${data.totals.recordings}টি রেকর্ডিং লিংক নামানো হয়েছে`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <FileAudio className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">এক দিনের কল ও রেকর্ডিং সামারি</h2>
        <input
          type="date"
          value={dateKey}
          max={todayDhaka()}
          onChange={(event) => setDateKey(event.target.value)}
          className="ml-auto rounded-lg border border-border bg-surface px-2 py-1 text-xs"
        />
        <Button size="sm" disabled={build.isPending} onClick={() => build.mutate()}>
          {build.isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          সামারি ও রেকর্ডিং
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={toDoc.isPending}
          onClick={() => toDoc.mutate()}
        >
          {toDoc.isPending ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Google Doc
        </Button>
      </header>

      <p className="mt-1 text-xs text-muted-foreground">
        ওই দিনের প্রতিটি কল, সঠিক সংখ্যা ও কথার সময়, আর প্রতিটি রেকর্ডিংয়ের ৬ ঘণ্টার জন্য সাইন করা শোনার লিংক
        একটি ফাইলে নামে। যে কলের অডিও জমা নেই, সেখানে লিংকের বদলে আসল অবস্থাই লেখা থাকে। Google Doc-এ প্রতিদিনের
        তালিকা যায় — ফাইলের নাম: তারিখ_এজেন্ট_লিড_নম্বর_কল-নম্বর।
      </p>

      {docLink && (
        <a
          href={docLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs font-semibold text-primary underline"
        >
          {dateKey} তারিখের Google Doc খুলুন
        </a>
      )}

      {result && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Tile label="মোট কল" value={String(result.totals.calls)} hint={`${result.totals.connected}টিতে কথা হয়েছে`} />
          <Tile label="মোট কথার সময়" value={result.totals.talkLabel} hint="ঘণ্টা:মিনিট:সেকেন্ড" />
          <Tile
            label="রেকর্ডিং"
            value={String(result.totals.recordings)}
            hint={`${result.totals.recordingsMissing}টিতে অডিও নেই · ${result.totals.transcripts}টি লেখা হয়েছে`}
          />
        </div>
      )}

      {result && result.calls.length > 0 && (
        <div className="mt-3 max-h-72 overflow-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3">সময়</th>
                <th className="py-1.5 pr-3">এজেন্ট</th>
                <th className="py-1.5 pr-3">লিড</th>
                <th className="py-1.5 pr-3">সময়কাল</th>
                <th className="py-1.5">রেকর্ডিং</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {result.calls.map((call) => (
                <tr key={call.id}>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{call.atDhaka}</td>
                  <td className="py-1.5 pr-3">{call.agentName}</td>
                  <td className="py-1.5 pr-3">{call.leadName}</td>
                  <td className="tabular py-1.5 pr-3">{call.durationLabel}</td>
                  <td className="py-1.5 text-xs">
                    {call.audioUrl ? (
                      <a
                        href={call.audioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        শুনুন
                      </a>
                    ) : (
                      <span className="text-muted-foreground">{call.recordingStatus}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
