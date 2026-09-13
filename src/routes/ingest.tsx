import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Lock, PlugZap, ShieldAlert, Stethoscope, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminGate } from "@/components/crm/AdminPinDialog";
import { AppShell } from "@/components/crm/AppShell";
import { SnapshotSkeleton } from "@/components/crm/SnapshotSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { checkIngestPayload, runIngestDiagnostics } from "@/lib/ingest.functions";
import { INGEST_ENDPOINTS, type IngestKind } from "@/lib/ingest-schemas";
import { useAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/ingest")({
  head: () => ({
    meta: [
      { title: "Ingest Validation — Winstone Connect" },
      {
        name: "description",
        content:
          "Check the phone app's data pipes: endpoint health, payload validation and the data problems worth fixing before the floor goes live.",
      },
      { property: "og:title", content: "Ingest Validation — Winstone Connect" },
      {
        property: "og:description",
        content: "Validate call recording, WhatsApp and lead payloads against the live rules.",
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
  component: IngestPage,
});

function IngestPage() {
  return (
    <AppShell>
      <AdminGate
        locked={(openPin) => (
          <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
            <span className="grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
              <PlugZap className="size-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Ingest Validation</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Endpoint health, payload checks and data problems. Master or IT PIN required.
              </p>
            </div>
            <Button size="lg" onClick={openPin}>
              <Lock className="size-4" /> Enter PIN
            </Button>
          </div>
        )}
      >
        <IngestBoard />
      </AdminGate>
    </AppShell>
  );
}

function IngestBoard() {
  const adminToken = useAdminToken();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const diagnostics = useMutation({
    mutationFn: () => runIngestDiagnostics({ data: { adminToken: adminToken ?? "" } }),
  });

  useEffect(() => {
    if (adminToken) diagnostics.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const [kind, setKind] = useState<IngestKind>("recording");
  const [payload, setPayload] = useState(INGEST_ENDPOINTS[0]!.sample);
  const check = useMutation({
    mutationFn: () => checkIngestPayload({ data: { adminToken: adminToken ?? "", kind, payload } }),
  });

  const pickKind = (next: IngestKind) => {
    setKind(next);
    setPayload(INGEST_ENDPOINTS.find((e) => e.kind === next)!.sample);
    check.reset();
  };

  const result = check.data;
  const health = diagnostics.data;

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <Stethoscope className="size-5 text-primary" /> Ingest Validation
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Everything the phone app sends, checked before and after it arrives.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Pipe health</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => diagnostics.mutate()}
            disabled={diagnostics.isPending}
          >
            {diagnostics.isPending ? "Checking…" : "Re-check"}
          </Button>
        </div>
        {diagnostics.isError && (
          <p className="text-sm text-destructive">{(diagnostics.error as Error).message}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(health?.checks ?? []).map((c) => (
            <div key={c.key} className="card-elevated p-4">
              <div className="flex items-center gap-2">
                {c.ok ? (
                  <CheckCircle2 className="size-4 text-live" />
                ) : (
                  <XCircle className="size-4 text-destructive" />
                )}
                <p className="text-sm font-semibold">{c.label}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card-elevated p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldAlert className="size-4 text-warning" /> Data problems
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {(health?.problems ?? []).map((p) => (
              <li key={p.key} className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{p.label}</span>
                  <Badge
                    variant={p.count ? "destructive" : "secondary"}
                    className="rounded-full tabular"
                  >
                    {p.count}
                  </Badge>
                </div>
                {p.count > 0 && <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>}
              </li>
            ))}
            {!health && <li className="text-muted-foreground">Running checks…</li>}
          </ul>
          {health && (
            <dl className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
              <Row label="Leads stored" value={String(health.volumes.leads)} />
              <Row label="Call logs" value={String(health.volumes.calls)} />
              <Row label="WhatsApp logs" value={String(health.volumes.messages)} />
              <Row
                label="Last call received"
                value={
                  health.volumes.lastCallAt
                    ? new Date(health.volumes.lastCallAt).toLocaleString()
                    : "never"
                }
              />
              <Row
                label="Last WhatsApp received"
                value={
                  health.volumes.lastMessageAt
                    ? new Date(health.volumes.lastMessageAt).toLocaleString()
                    : "never"
                }
              />
            </dl>
          )}
        </div>

        <div className="card-elevated space-y-3 p-4">
          <h2 className="text-sm font-semibold">Payload tester</h2>
          <p className="text-xs text-muted-foreground">
            Paste what the phone app sends. Nothing is saved — it only reports what would be
            rejected.
          </p>
          <div>
            <Label className="text-xs text-muted-foreground">Endpoint</Label>
            <Select value={kind} onValueChange={(v) => pickKind(v as IngestKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INGEST_ENDPOINTS.map((e) => (
                  <SelectItem key={e.kind} value={e.kind}>
                    {e.label} — {e.what}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">
              POST {origin}
              {INGEST_ENDPOINTS.find((e) => e.kind === kind)!.path}
            </p>
          </div>
          <Textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={12}
            className="font-mono text-xs"
            spellCheck={false}
          />
          <Button onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? "Checking…" : "Validate payload"}
          </Button>
          {check.isError && (
            <p className="text-sm text-destructive">{(check.error as Error).message}</p>
          )}
          {result && result.ok && (
            <div className="rounded-lg border border-live/40 bg-live/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4 text-live" /> Accepted — this payload would be
                stored.
              </p>
              <pre className="mt-2 overflow-x-auto text-xs text-muted-foreground">
                {result.normalized}
              </pre>
            </div>
          )}
          {result && !result.ok && (
            <ul className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              {result.issues.map((issue, i) => (
                <li key={i}>
                  <span className="font-mono text-xs font-semibold">{issue.field}</span> —{" "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
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
