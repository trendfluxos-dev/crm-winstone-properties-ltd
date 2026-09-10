import { createFileRoute } from "@tanstack/react-router";
import { Database, KeyRound, Lock, Radio, Receipt } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminGate } from "@/components/crm/AdminPinDialog";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { AppShell } from "@/components/crm/AppShell";
import { CopilotDrawer } from "@/components/crm/CopilotDrawer";
import { ProPlanCard } from "@/components/crm/ProPlanCard";
import { SystemCustomizer } from "@/components/crm/SystemCustomizer";
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
      <AdminGate
        locked={(openPin) => (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <Database className="size-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">System Controller</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Data health, ingestion endpoints and monthly billing. Master PIN required.
              </p>
            </div>
            <Button size="lg" onClick={openPin}>
              <Lock className="size-4" /> Enter PIN
            </Button>
          </div>
        )}
      >
        <SystemBoard />
      </AdminGate>
    </AppShell>
  );
}

const ENDPOINTS = [
  { path: "/api/public/ingest/recording", what: "Call audio + AI transcript & sentiment" },
  { path: "/api/public/ingest/message", what: "WhatsApp conversation logs" },
  { path: "/api/public/ingest/lead", what: "Website / ad form leads (auto round-robin)" },
];

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
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">System &amp; Billing</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Core engine status, ingestion endpoints and monthly telephony cost.
          </p>
        </div>
        <CopilotDrawer />
      </div>

      <ProPlanCard />

      <SystemCustomizer />




      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Receipt className="size-4 text-primary" /> {billing.monthLabel} billing
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Rate ৳/min
            <Input
              value={rate}
              onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-20"
              inputMode="decimal"
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Outgoing dials" value={String(billing.dials)} hint={`${billing.newLeads} new leads`} />
          <Tile
            label="Connected"
            value={`${billing.connectedPct.toFixed(0)}%`}
            hint={`${billing.connected} of ${billing.dials} calls`}
          />
          <Tile
            label="Billable minutes"
            value={String(billing.billableMinutes)}
            hint="Rounded up per call"
          />
          <Tile
            label="Estimated carrier cost"
            value={`৳${billing.carrierCost.toFixed(2)}`}
            hint={`${billing.aiAnalysed} calls AI-analysed`}
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card-elevated p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-primary" /> Data health
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Agent profiles" value={`${profiles.filter((p) => p.is_active).length} active / ${profiles.length}`} />
            <Row label="Leads" value={String(leads.length)} />
            <Row label="Call recordings" value={String(calls.length)} />
            <Row label="Verified audio" value={String(calls.filter((c) => c.sync_status === "verified").length)} />
            <Row label="WhatsApp messages" value={String(messages.length)} />
            <Row label="Deals won (all time)" value={String(leads.filter((l) => l.outcome_category === "deal_won").length)} />
          </dl>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Lead sources
          </h3>
          <dl className="mt-2 space-y-1.5 text-sm">
            {sources.length === 0 && <p className="text-sm text-muted-foreground">No leads yet.</p>}
            {sources.map(([source, total]) => (
              <Row key={source} label={source} value={String(total)} />
            ))}
          </dl>
        </div>

        <div className="card-elevated p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="size-4 text-primary" /> Ingestion endpoints
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Android client posts JSON with header <code>x-ingest-secret</code>.
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
            <KeyRound className="size-3.5" /> Server keys in use
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>Ingest secret — stored server-side, never shown</li>
            <li>Master PIN — stored server-side, verified per unlock</li>
            <li>AI transcription & summary key — managed by the platform</li>
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
