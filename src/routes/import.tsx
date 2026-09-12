import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileUp, Loader2, Sheet, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/crm/AppShell";
import { RoleGate } from "@/components/crm/RoleGate";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_CSV, parseCsv, toLeadRows, type CsvLeadRow } from "@/lib/csv-leads";
import { importLeads } from "@/lib/crm.functions";
import { previewSheetLeads } from "@/lib/lead-sheet.functions";
import { getAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "লিড ইমপোর্ট — Winstone Connect" },
      {
        name: "description",
        content:
          "CSV ফাইল থেকে লিড ইমপোর্ট করুন: আপলোড করুন, প্রিভিউ দেখে ঠিক করুন, তারপর এজেন্টদের মধ্যে ভাগ করে দিন।",
      },
      { property: "og:title", content: "লিড ইমপোর্ট — Winstone Connect" },
      {
        property: "og:description",
        content: "CSV আপলোড, প্রিভিউ ও ডেমো ফাইল দিয়ে লিড ইমপোর্ট যাচাই করুন।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ImportPage,
});

function ImportPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority", "coordinator"]}
        icon={<FileUp className="size-7" />}
        title="লিড ইমপোর্ট"
        description="CSV ফাইল থেকে লিড যোগ করা। কোঅর্ডিনেটর একাউন্ট বা মাস্টার পিন দরকার।"
      >
        <ImportScreen />
      </RoleGate>
    </AppShell>
  );
}

function downloadDemoCsv() {
  const blob = new Blob([`\uFEFF${DEMO_CSV}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "winstone-demo-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function ImportScreen() {
  const queryClient = useQueryClient();
  const run = useServerFn(importLeads);
  const [rows, setRows] = useState<CsvLeadRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [autoAssign, setAutoAssign] = useState(true);
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [sheetTab, setSheetTab] = useState<string | null>(null);
  const loadSheet = useServerFn(previewSheetLeads);

  const sheetMutation = useMutation({
    mutationFn: (tab: string | null) =>
      loadSheet({ data: { adminToken: getAdminToken() ?? "", sheetUrl, tab } }),
    onSuccess: (result) => {
      setSheetTabs(result.tabs);
      setSheetTab(result.tab);
      setRows(result.rows);
      setFileName(`Google Sheet · ${result.tab}`);
      if (result.rows.length === 0)
        toast.error("এই ট্যাবে নাম ও ফোন নম্বরসহ কোনো সারি পাওয়া যায়নি");
      else toast.success(`${result.rows.length}টি লিড প্রিভিউতে এলো`);
    },
    onError: (error: Error) => toast.error(error.message),
  });


  const load = (text: string, label: string) => {
    const parsed = toLeadRows(parseCsv(text));
    setRows(parsed);
    setFileName(label);
    if (parsed.length === 0) toast.error("এই ফাইলে ব্যবহারযোগ্য কোনো লিড পাওয়া যায়নি");
    else toast.success(`${parsed.length}টি লিড প্রিভিউতে এলো`);
  };

  const mutation = useMutation({
    mutationFn: () => run({ data: { adminToken: getAdminToken() ?? "", rows, autoAssign } }),
    onSuccess: (result) => {
      toast.success(`${result.imported}টি লিড যোগ হলো`, {
        description: result.skipped
          ? `${result.skipped}টি বাদ পড়েছে (একই নম্বর বা নম্বর ঠিক নেই)`
          : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      setRows([]);
      setFileName(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <FileUp className="size-5 text-primary" /> লিড ইমপোর্ট
        </h1>
        <p className="text-sm text-muted-foreground">
          কলাম: <code>name, phone, company, notes</code> — হেডার সারি না থাকলেও চলবে। আগে থেকে থাকা
          নম্বর নিজে থেকেই বাদ পড়বে।
        </p>
      </header>

      <section className="card-elevated space-y-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="file"
            accept=".csv,text/csv,.txt"
            className="sm:max-w-sm"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              load(await file.text(), file.name);
            }}
          />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadDemoCsv}>
              <Download className="size-3.5" /> ডেমো CSV নামান
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => load(DEMO_CSV, "winstone-demo-leads.csv")}
            >
              ডেমো দিয়ে পরীক্ষা
            </Button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={autoAssign} onCheckedChange={(v) => setAutoAssign(v === true)} />
          <Label>চালু এজেন্টদের মধ্যে সমানভাবে ভাগ করে দিন</Label>
        </label>
      </section>

      <section className="card-elevated space-y-3 p-4">
        <header className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
            <Sheet className="size-4 text-primary" /> Google Sheet থেকে লিড আনুন
          </h2>
          <p className="text-xs text-muted-foreground">
            শিটের লিংক দিন। শিটটি সংযুক্ত Google অ্যাকাউন্টের সাথে শেয়ার করা থাকতে হবে।
          </p>
        </header>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={sheetUrl}
            onChange={(event) => setSheetUrl(event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            className="sm:flex-1"
          />
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={sheetUrl.trim().length < 20 || sheetMutation.isPending}
            onClick={() => sheetMutation.mutate(sheetTab)}
          >
            {sheetMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sheet className="size-3.5" />
            )}
            শিট পড়ুন
          </Button>
        </div>

        {sheetTabs.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {sheetTabs.map((tab) => (
              <Button
                key={tab}
                size="sm"
                variant={tab === sheetTab ? "default" : "outline"}
                disabled={sheetMutation.isPending}
                onClick={() => sheetMutation.mutate(tab)}
              >
                {tab}
              </Button>
            ))}
          </div>
        ) : null}
      </section>


      {fileName ? (
        <section className="card-elevated space-y-3 p-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold tracking-tight">প্রিভিউ</h2>
              <p className="text-xs text-muted-foreground">
                {fileName} · {rows.length}টি লিড
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="gap-1.5"
                onClick={() => {
                  setRows([]);
                  setFileName(null);
                }}
              >
                <Trash2 className="size-3.5" /> বাতিল
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={rows.length === 0 || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {rows.length || ""} লিড যোগ করুন
              </Button>
            </div>
          </header>

          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              এই ফাইলে নাম ও ফোন নম্বরসহ কোনো সারি নেই।
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">নাম</th>
                      <th className="py-2 pr-3 font-medium">ফোন</th>
                      <th className="py-2 pr-3 font-medium">প্রতিষ্ঠান</th>
                      <th className="py-2 font-medium">মন্তব্য</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((row, index) => (
                      <tr key={`${row.phone_number}-${index}`} className="border-t border-border/60">
                        <td className="py-2 pr-3">{row.name}</td>
                        <td className="tabular py-2 pr-3">{row.phone_number}</td>
                        <td className="py-2 pr-3">{row.company ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">{row.notes ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 md:hidden">
                {rows.slice(0, 50).map((row, index) => (
                  <li
                    key={`${row.phone_number}-${index}`}
                    className="rounded-lg border border-border/60 p-2.5"
                  >
                    <p className="text-sm font-medium">{row.name}</p>
                    <p className="tabular text-xs text-muted-foreground">{row.phone_number}</p>
                    {row.company ? <p className="text-xs">{row.company}</p> : null}
                    {row.notes ? (
                      <p className="text-[11px] text-muted-foreground">{row.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>

              {rows.length > 50 ? (
                <p className="text-xs text-muted-foreground">
                  আরও {rows.length - 50}টি লিড আছে — যোগ করলে সবগুলোই যাবে।
                </p>
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
