import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Archive, Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAdminToken } from "@/lib/local-session";
import { listYearArchives, recordYearArchive, yearArchiveExport } from "@/lib/workday.functions";

/**
 * Yearly retention, owned by the IT council.
 *
 * Nothing is ever deleted automatically. Once a year the council downloads the
 * full year (leads + submitted reports), stores it in the company's own storage,
 * and records where it went. That record is what makes a later account refresh
 * safe — and it is kept immutably, so an agent's history is always accounted for.
 */
function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return "";
  const head = Object.keys(rows[0]!);
  const lines = [head.map(csvCell).join(",")];
  for (const row of rows) lines.push(head.map((key) => csvCell(row[key])).join(","));
  return `\ufeff${lines.join("\r\n")}`;
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function YearArchivePanel() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const exportYear = useServerFn(yearArchiveExport);
  const record = useServerFn(recordYearArchive);
  const listFn = useServerFn(listYearArchives);

  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [location, setLocation] = useState("");
  const [counts, setCounts] = useState<{ leads: number; reports: number } | null>(null);

  const archives = useQuery({
    queryKey: ["year-archives"],
    queryFn: () => listFn({ data: { adminToken } }),
  });

  const pull = useMutation({
    mutationFn: () => exportYear({ data: { adminToken, year } }),
    onSuccess: (result) => {
      const leads = result.leads as Record<string, unknown>[];
      const reports = result.reports as Record<string, unknown>[];
      if (leads.length === 0 && reports.length === 0) {
        toast.error("এই বছরের কোনো তথ্য নেই");
        return;
      }
      if (leads.length) download(`winstone-leads-${year}.csv`, toCsv(leads));
      if (reports.length) download(`winstone-reports-${year}.csv`, toCsv(reports));
      setCounts({ leads: leads.length, reports: reports.length });
      toast.success(`${year} সালের ${leads.length}টি লিড ও ${reports.length}টি রিপোর্ট নামানো হয়েছে`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: () =>
      record({
        data: {
          adminToken,
          year,
          storageLocation: location,
          leadCount: counts?.leads ?? 0,
          reportCount: counts?.reports ?? 0,
        },
      }),
    onSuccess: () => {
      toast.success("সংরক্ষণের তথ্য লেখা হয়েছে");
      setLocation("");
      void queryClient.invalidateQueries({ queryKey: ["year-archives"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="card-elevated space-y-3 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <Archive className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">বার্ষিক সংরক্ষণ (এক বছর পর)</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {archives.data?.length ?? 0}টি বছর সংরক্ষিত
        </span>
      </header>

      <p className="text-xs text-muted-foreground">
        কোনো তথ্য নিজে থেকে মুছে যায় না। বছর শেষে পুরো বছরের লিড ও এজেন্টদের জমা দেওয়া রিপোর্ট
        নামিয়ে কোম্পানির নিজের স্টোরেজে রাখুন, তারপর কোথায় রাখলেন তা এখানে লিখে রাখুন — এই
        রেকর্ডটি আর বদলানো যায় না।
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          value={year}
          min={2020}
          max={thisYear}
          onChange={(e) => setYear(Number(e.target.value) || thisYear)}
          className="h-9 w-28"
          aria-label="বছর"
        />
        <Button size="sm" disabled={pull.isPending} onClick={() => pull.mutate()}>
          {pull.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          বছরের সব নামান
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="কোথায় সংরক্ষণ করলেন (যেমন Google Drive ফোল্ডার / অফিস সার্ভার)"
          className="h-9 min-w-[220px] flex-1"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={save.isPending || location.trim().length < 3}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          সংরক্ষণ লিখে রাখুন
        </Button>
      </div>

      {archives.data && archives.data.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {archives.data.map((row) => (
            <li key={row.archive_year} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className="tabular text-sm font-semibold">{row.archive_year}</span>
              <span className="text-xs text-muted-foreground">
                {row.lead_count}টি লিড · {row.report_count}টি রিপোর্ট
              </span>
              <span className="ml-auto truncate text-xs text-muted-foreground">
                {row.storage_location}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
