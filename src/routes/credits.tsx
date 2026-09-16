import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins, Download, Receipt, Users } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { RoleGate } from "@/components/crm/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCreditsReport } from "@/lib/credits-report.functions";
import { getAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/credits")({
  head: () => ({
    meta: [
      { title: "ক্রেডিট বিল — Winstone Connect" },
      {
        name: "description",
        content: "মাসভিত্তিক এআই ব্যবহার ও অনুমানিত লোভাবল ক্রেডিট খরচের রিপোর্ট।",
      },
      { property: "og:title", content: "ক্রেডিট বিল — Winstone Connect" },
      { property: "og:description", content: "এআই কাজের মাসিক ক্রেডিট খরচের হিসাব।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CreditsPage,
});

function CreditsPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority"]}
        icon={<Receipt className="size-7" />}
        title="ক্রেডিট বিল"
        description="এআই ব্যবহারের মাসিক হিসাব। মাস্টার পিন লাগবে।"
      >
        <CreditsBoard />
      </RoleGate>
    </AppShell>
  );
}

function currentMonth(): string {
  return new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 7);
}

function CreditsBoard() {
  const [month, setMonth] = useState(currentMonth());
  const reportQuery = useQuery({
    queryKey: ["credits-report", month],
    queryFn: () => getCreditsReport({ data: { adminToken: getAdminToken(), month } }),
    refetchInterval: 60_000,
  });
  const report = reportQuery.data;

  const downloadCsv = () => {
    if (!report) return;
    const lines = [
      ["ক্রেডিট বিল", report.monthLabel].join(","),
      "",
      "ক্যাটাগরি,কাজের সংখ্যা,অনুমানিত ক্রেডিট",
      ...report.categories.map((c) => `${c.label},${c.calls},${c.credits}`),
      `মোট,${report.totals.calls},${report.totals.credits}`,
      "",
      "তারিখ,কাজের সংখ্যা,অনুমানিত ক্রেডিট",
      ...report.daily.map((d) => `${d.day},${d.calls},${d.credits}`),
      "",
      "এজেন্ট,কাজের সংখ্যা,অনুমানিত ক্রেডিট",
      ...report.agents.map((a) => `"${a.name}",${a.calls},${a.credits}`),
    ].join("\r\n");
    const blob = new Blob([`\uFEFF${lines}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `credits-${report.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">ক্রেডিট বিল</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            এই সিস্টেমের ভেতরের এআই কাজের আসল গণনা থেকে অনুমানিত ক্রেডিট খরচ — টাকার হিসাব নয়।
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" onClick={downloadCsv} disabled={!report}>
            <Download className="size-4" /> CSV
          </Button>
        </div>
      </div>

      {reportQuery.isLoading && <p className="text-sm text-muted-foreground">হিসাব আনছে…</p>}
      {reportQuery.isError && (
        <p className="text-sm text-destructive">
          {reportQuery.error instanceof Error ? reportQuery.error.message : "রিপোর্ট আনা যায়নি"}
        </p>
      )}

      {report && (
        <>
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <p className="font-medium">গত ৭ দিনের হিসাব (নজরদারি)</p>
            <p className="mt-1 text-muted-foreground">
              গত ৭ দিনে খরচ ≈ {report.recent7.credits} ক্রেডিট ({report.recent7.calls}টি এআই কাজ),
              দিনে ≈ {report.recent7.perDay} ক্রেডিট। একই হারে চললে পরের ৭ দিনে ≈{" "}
              {report.recent7.next7} ক্রেডিট লাগবে। কোনো ফিচার বন্ধ করা হয়নি — শুধু হিসাব দেখানো
              হচ্ছে।
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile
              label={`${report.monthLabel} — মোট`}
              value={`${report.totals.credits} ক্রেডিট`}
              hint={`${report.totals.calls}টি এআই কাজ`}
            />
            <Tile
              label="এআই প্রশ্ন (Winstone AI)"
              value={String(
                report.categories.find((c) => c.category === "command_agent")?.calls ?? 0,
              )}
              hint={`${report.categories.find((c) => c.category === "command_agent")?.credits ?? 0} ক্রেডিট`}
            />
            <Tile
              label="ট্রান্সক্রিপ্ট"
              value={String(
                report.categories.find((c) => c.category === "transcription")?.calls ?? 0,
              )}
              hint={`${report.categories.find((c) => c.category === "transcription")?.credits ?? 0} ক্রেডিট`}
            />
            <Tile
              label="সারসংক্ষেপ ও শ্রেণিবিন্যাস"
              value={String(report.categories.find((c) => c.category === "analysis")?.calls ?? 0)}
              hint={`${report.categories.find((c) => c.category === "analysis")?.credits ?? 0} ক্রেডিট`}
            />
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Coins className="size-4 text-primary" /> হার তালিকা (সার্ভারে সংরক্ষিত)
              </h2>
              {report.rateCards.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">কোনো হার নির্ধারণ করা নেই।</p>
              )}
              <dl className="mt-3 space-y-1.5 text-sm">
                {report.rateCards.map((c) => (
                  <Row
                    key={`${c.provider}-${c.model ?? ""}-${c.operation ?? ""}`}
                    label={`${c.provider}${c.operation ? ` · ${c.operation}` : ""}${c.model ? ` · ${c.model}` : ""}`}
                    value={`${c.creditsPerUnit} ক্রেডিট / ${c.unitKind}`}
                  />
                ))}
              </dl>
              <p className="mt-3 text-xs text-muted-foreground">
                প্রতিটি হিসাব তৈরির সময়ের হার দিয়েই স্থায়ীভাবে লেখা হয়, তাই হার বদলালেও পুরোনো
                হিসাব বদলায় না।
              </p>
            </div>

            <div className="card-elevated p-4">
              <h2 className="text-sm font-semibold">মাসের অনুমান ও বাজেট</h2>
              {report.projection.basis === "none" ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  এই মাসে কোনো রেকর্ড নেই, তাই অনুমান দেখানো যাচ্ছে না।
                </p>
              ) : (
                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row
                    label={`চলতি হার (${report.projection.elapsedDays} দিনের হিসাব)`}
                    value={`${report.projection.perDay} ক্রেডিট / দিন`}
                  />
                  <Row
                    label={`পুরো মাসে (${report.projection.monthDays} দিন)`}
                    value={`≈ ${report.projection.monthEnd} ক্রেডিট`}
                  />
                  <Row
                    label="টাকায় খরচ"
                    value={`${report.totals.amount} ${report.totals.currency}`}
                  />
                </dl>
              )}
              {report.budget ? (
                <dl className="mt-3 space-y-1.5 border-t border-border/60 pt-3 text-sm">
                  <Row label="মাসিক বাজেট" value={`${report.budget.budget} ক্রেডিট`} />
                  <Row
                    label="ব্যবহার হয়েছে"
                    value={`${report.budget.spent} ক্রেডিট (${report.budget.percent}%)`}
                  />
                  <Row
                    label="সীমা ছাড়ালে"
                    value={
                      report.budget.hardCap
                        ? "ঐচ্ছিক এআই বন্ধ, কল ও রিপোর্ট চালু"
                        : "শুধু সতর্কবার্তা"
                    }
                  />
                </dl>
              ) : (
                <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  কোনো মাসিক বাজেট নির্ধারণ করা নেই।
                </p>
              )}
            </div>
          </section>

          {report.providers.length > 0 && (
            <section className="card-elevated p-4">
              <h2 className="text-sm font-semibold">প্রদানকারী ও মডেল অনুযায়ী</h2>
              <dl className="mt-3 space-y-1.5 text-sm">
                {report.providers.map((p) => (
                  <Row
                    key={`${p.provider}-${p.model ?? ""}`}
                    label={`${p.provider}${p.model ? ` · ${p.model}` : ""} · ${p.calls}টি`}
                    value={`${p.credits} ক্রেডিট`}
                  />
                ))}
              </dl>
            </section>
          )}


          <section className="grid gap-4 lg:grid-cols-2">
            <div className="card-elevated p-4">
              <h2 className="text-sm font-semibold">দিনভিত্তিক খরচ</h2>
              {report.daily.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  এই মাসে এখনো কোনো এআই কাজ হয়নি।
                </p>
              )}
              <div className="mt-3 max-h-96 space-y-1.5 overflow-y-auto text-sm">
                {report.daily.map((d) => (
                  <Row
                    key={d.day}
                    label={`${d.day} · ${d.calls}টি কাজ`}
                    value={`${d.credits} ক্রেডিট`}
                  />
                ))}
              </div>
            </div>

            <div className="card-elevated p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" /> এজেন্টভিত্তিক ব্যবহার
              </h2>
              {report.agents.length === 0 && (
                <p className="mt-3 text-sm text-muted-foreground">এখনো কোনো তথ্য নেই।</p>
              )}
              <div className="mt-3 space-y-1.5 text-sm">
                {report.agents.map((a) => (
                  <Row
                    key={a.agentId ?? "system"}
                    label={`${a.name} · ${a.calls}টি`}
                    value={`${a.credits} ক্রেডিট`}
                  />
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        আইটি কনসোলে ফিরে যেতে{" "}
        <Link to="/system" className="underline">
          এখানে চাপুন
        </Link>
        ।
      </p>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="tabular mt-1 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
