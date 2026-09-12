import { createFileRoute } from "@tanstack/react-router";
import { Database, KeyRound, Lock, Radio, Receipt } from "lucide-react";
import { useMemo, useState } from "react";

import { AccountApprovals } from "@/components/crm/AccountApprovals";
import { ApkInstallCard } from "@/components/crm/ApkInstallCard";
import { AuditTrail } from "@/components/crm/AuditTrail";
import { DocSummaryPanel } from "@/components/crm/DocSummaryPanel";
import { ReportSheetPanel } from "@/components/crm/ReportSheetPanel";
import { ShiftSummaryPanel } from "@/components/crm/ShiftSummaryPanel";
import { StaffAccountsTable } from "@/components/crm/StaffAccountsTable";
import { RoleGate } from "@/components/crm/RoleGate";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { SystemCustomizer } from "@/components/crm/SystemCustomizer";
import { SystemNoticeBar } from "@/components/crm/SystemNoticeBar";
import { CallOpsPanel } from "@/components/crm/CallOpsPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildBillingSummary, DEFAULT_RATE_PER_MINUTE, useSnapshot } from "@/lib/crm-data";

export const Route = createFileRoute("/system")({
  head: () => ({
    meta: [
      { title: "System & Billing — Winstone Connect" },
      {
        name: "description",
        content:
          "IT controller view: database health, ingestion endpoints, API key status and monthly telephony billing.",
      },
      { property: "og:title", content: "System & Billing — Winstone Connect" },
      {
        property: "og:description",
        content: "Monthly call minutes, carrier cost estimates and ingestion endpoint health.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => (
    <AppShell>
      <SnapshotSkeleton />
    </AppShell>
  ),
  component: SystemPage,
});

function SystemPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority"]}
        icon={<Database className="size-7" />}
        title="আইটি কনসোল"
        description="সিস্টেম সেটিং, অ্যাকাউন্ট অনুমোদন, ডেটার অবস্থা আর বিল। মাস্টার পিন লাগবে।"
      >
        <SystemBoard />
      </RoleGate>
    </AppShell>
  );
}

const ENDPOINTS = [
  { path: "/api/public/ingest/recording", what: "কলের অডিও + এআই ট্রান্সক্রিপ্ট ও মনোভাব" },
  { path: "/api/public/ingest/message", what: "হোয়াটসঅ্যাপ কথার রেকর্ড" },
  { path: "/api/public/ingest/lead", what: "ওয়েবসাইট / বিজ্ঞাপনের লিড (নিজে থেকে ভাগ হয়)" },
];

const SOURCE_LABELS: Record<string, string> = {
  manual: "হাতে দেওয়া",
  call: "কল",
  whatsapp: "হোয়াটসঅ্যাপ",
  webhook: "ওয়েবসাইট",
  csv: "সিএসভি ইমপোর্ট",
  facebook_ads: "ফেসবুক বিজ্ঞাপন",
};

function SystemBoard() {
  const { profiles, leads, calls, messages } = useSnapshot();
  const [rate, setRate] = useState(String(DEFAULT_RATE_PER_MINUTE));

  const billing = useMemo(
    () => buildBillingSummary(calls, leads, Number(rate) || DEFAULT_RATE_PER_MINUTE),
    [calls, leads, rate],
  );

  const sources = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leads) map.set(lead.source, (map.get(lead.source) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [leads]);

  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">সিস্টেম ও বিল</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            মূল ইঞ্জিনের অবস্থা, ডেটা আসার ঠিকানা আর মাসিক টেলিফোন খরচ।
          </p>
        </div>
        <CopilotDrawer />
      </div>

      <SystemNoticeBar surface="it" />

      <CallOpsPanel showControls />

      <DocSummaryPanel />

      <ReportSheetPanel />

      <StaffAccountsTable />

      <ShiftSummaryPanel scope="it" />

      <AccountApprovals />

      <SystemCustomizer />

      <ApkInstallCard />

      <AuditTrail />




      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Receipt className="size-4 text-primary" /> {billing.monthLabel} মাসের বিল
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            রেট ৳/মিনিট
            <Input
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-20"
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="করা কল" value={String(billing.dials)} hint={`${billing.newLeads}টি নতুন লিড`} />
          <Tile
            label="কথা হয়েছে"
            value={`${billing.connectedPct.toFixed(0)}%`}
            hint={`${billing.dials}টির মধ্যে ${billing.connected}টি কলে`}
          />
          <Tile
            label="বিলযোগ্য মিনিট"
            value={String(billing.billableMinutes)}
            hint="প্রতি কলে উপরের দিকে গোনা"
          />
          <Tile
            label="আনুমানিক অপারেটর খরচ"
            value={`৳${billing.carrierCost.toFixed(2)}`}
            hint={`${billing.aiAnalysed}টি কল এআই দেখেছে`}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card-elevated p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-primary" /> ডেটার অবস্থা
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="এজেন্ট প্রোফাইল" value={`${profiles.filter((p) => p.is_active).length} জন চালু / ${profiles.length}`} />
            <Row label="লিড" value={String(leads.length)} />
            <Row label="কল রেকর্ডিং" value={String(calls.length)} />
            <Row label="যাচাই হওয়া অডিও" value={String(calls.filter((c) => c.sync_status === "verified").length)} />
            <Row label="হোয়াটসঅ্যাপ মেসেজ" value={String(messages.length)} />
            <Row label="ডিল জেতা (সব সময়ের)" value={String(leads.filter((l) => l.outcome_category === "deal_won").length)} />
          </dl>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            লিড কোথা থেকে এসেছে
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            {sources.length === 0 && <p className="text-sm text-muted-foreground">এখনো কোনো লিড নেই।</p>}
            {sources.map(([source, total]) => (
              <Row key={source} label={SOURCE_LABELS[source] ?? source} value={String(total)} />
            ))}
          </dl>
        </div>

        <div className="card-elevated p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="size-4 text-primary" /> ডেটা আসার ঠিকানা
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            অ্যান্ড্রয়েড অ্যাপ <code>x-ingest-secret</code> হেডার দিয়ে তথ্য পাঠায়।
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {ENDPOINTS.map((e) => (
              <li key={e.path} className="rounded-lg bg-surface-2 px-3 py-2">
                <p className="font-mono text-xs break-all">
                  POST {origin}
                  {e.path}
                </p>
                <p className="text-xs text-muted-foreground">{e.what}</p>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <KeyRound className="size-3.5" /> যেসব চাবি ব্যবহার হচ্ছে
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>ইনজেস্ট সিক্রেট — সার্ভারে রাখা, কখনো দেখানো হয় না</li>
            <li>মাস্টার পিন — সার্ভারে রাখা, প্রতিবার খোলার সময় মিলিয়ে দেখা হয়</li>
            <li>এআই ট্রান্সক্রিপ্ট ও সারসংক্ষেপের চাবি — প্ল্যাটফর্ম নিজেই দেখে</li>
          </ul>
        </div>
      </section>
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
