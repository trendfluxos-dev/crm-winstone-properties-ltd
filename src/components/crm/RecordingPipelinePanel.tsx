import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CloudCheck, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  recordingPipeline,
  retryPipelineItem,
  verifyDriveBackups,
  type PipelineRow,
  type StageState,
} from "@/lib/pipeline.functions";
import { adminToken } from "@/lib/session";

const FILTERS: { key: Parameters<typeof recordingPipeline>[0] extends never ? string : string; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "failed", label: "ব্যর্থ" },
  { key: "retry", label: "রিট্রাই" },
  { key: "pending", label: "চলছে / বাকি" },
  { key: "completed", label: "সম্পন্ন" },
  { key: "drive_failed", label: "Drive ব্যর্থ" },
  { key: "stt_failed", label: "ট্রান্সক্রিপ্ট ব্যর্থ" },
  { key: "ai_failed", label: "এআই ব্যর্থ" },
  { key: "supabase_failed", label: "রেকর্ডিং নেই" },
];

const STATE_LABEL: Record<StageState, string> = {
  verified: "যাচাই হয়েছে",
  success: "হয়েছে",
  processing: "চলছে",
  pending: "বাকি",
  failed: "ব্যর্থ",
  skipped: "প্রযোজ্য নয়",
};

function stateClass(state: StageState) {
  switch (state) {
    case "verified":
      return "bg-primary/15 text-primary";
    case "success":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
    case "processing":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
    case "failed":
      return "bg-destructive/15 text-destructive";
    case "skipped":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-surface-2 text-muted-foreground";
  }
}

const OVERALL_LABEL: Record<PipelineRow["overall"], string> = {
  completed: "COMPLETED",
  processing: "PROCESSING",
  retry: "RETRY",
  failed: "FAILED",
  pending: "PENDING",
};

/**
 * IT Console: the real recording pipeline, its retry queue and Drive
 * verification. Every badge is derived from stored rows — no simulated
 * progress, and a stage with no row shows as "বাকি".
 */
export function RecordingPipelinePanel() {
  const [filter, setFilter] = useState("all");
  const loadPipeline = useServerFn(recordingPipeline);
  const runRetry = useServerFn(retryPipelineItem);
  const runVerify = useServerFn(verifyDriveBackups);
  const queryClient = useQueryClient();

  const pipeline = useQuery({
    queryKey: ["recording-pipeline", filter],
    queryFn: () =>
      loadPipeline({ data: { adminToken: adminToken(), filter: filter as "all", days: 7, limit: 60 } }),
    refetchInterval: 30_000,
  });

  const retry = useMutation({
    mutationFn: (input: { recordingId: string; step: "drive" | "analysis" }) =>
      runRetry({ data: { adminToken: adminToken(), ...input } }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`রিট্রাই: ${result.outcome}`);
      else toast.error(result.detail ?? "রিট্রাই ব্যর্থ");
      void queryClient.invalidateQueries({ queryKey: ["recording-pipeline"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verify = useMutation({
    mutationFn: () => runVerify({ data: { adminToken: adminToken(), limit: 25 } }),
    onSuccess: (result) => {
      toast.success(
        `Drive যাচাই: ${result.verified}টি ফাইল আছে, ${result.missing}টি পাওয়া যায়নি (সারসংক্ষেপ ডক ${result.docsVerified} ঠিক / ${result.docsMissing} নেই)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["recording-pipeline"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = pipeline.data?.totals;
  const rows = pipeline.data?.rows ?? [];

  return (
    <section className="card-elevated space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-4 text-primary" /> রেকর্ডিং পাইপলাইন ও রিট্রাই কিউ
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            কল → রেকর্ডিং → সার্ভার → Drive → ট্রান্সক্রিপ্ট → এআই → শ্রেণিবিন্যাস। প্রতিটি ধাপ ডেটাবেসের
            প্রকৃত অবস্থা থেকে আসে।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void pipeline.refetch()}
            disabled={pipeline.isFetching}
          >
            <RefreshCw className={`size-3.5 ${pipeline.isFetching ? "animate-spin" : ""}`} /> রিফ্রেশ
          </Button>
          <Button size="sm" onClick={() => verify.mutate()} disabled={verify.isPending}>
            {verify.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CloudCheck className="size-3.5" />}{" "}
            Drive ফাইল যাচাই
          </Button>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ["দেখা হয়েছে", totals.scanned],
              ["সম্পন্ন", totals.completed],
              ["চলছে", totals.processing],
              ["বাকি", totals.pending],
              ["রিট্রাই", totals.retry],
              ["ব্যর্থ", totals.failed],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface-2 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="tabular text-lg font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === f.key ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pipeline.isLoading && <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>}
      {pipeline.isError && (
        <p className="text-sm text-destructive">{(pipeline.error as Error).message}</p>
      )}
      {!pipeline.isLoading && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">এই ফিল্টারে কোনো কল নেই।</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const driveFailed = row.stages.find((s) => s.key === "drive")?.state === "failed";
          const aiStuck = row.stages.some(
            (s) => (s.key === "stt" || s.key === "ai") && (s.state === "failed" || s.state === "pending"),
          );
          return (
            <div key={row.recordingId} className="rounded-xl border border-border/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {row.leadName ?? "অজানা লিড"} · {row.phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.agentName ?? "এজেন্ট অজানা"} · {row.durationSeconds} সেকেন্ড ·{" "}
                    {new Date(row.startedAt ?? row.createdAt).toLocaleString("bn-BD")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${stateClass(
                    row.overall === "completed"
                      ? "success"
                      : row.overall === "failed"
                        ? "failed"
                        : row.overall === "processing"
                          ? "processing"
                          : "pending",
                  )}`}
                >
                  {OVERALL_LABEL[row.overall]}
                </span>
              </div>

              <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {row.stages.map((s) => (
                  <div key={s.key} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{s.label}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${stateClass(s.state)}`}>
                        {STATE_LABEL[s.state]}
                      </span>
                    </div>
                    {s.detail && (
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{s.detail}</p>
                    )}
                  </div>
                ))}
              </div>

              {row.error && <p className="mt-2 text-xs text-destructive">{row.error}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground">চেষ্টা: {row.attempts}</span>
                {driveFailed && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ recordingId: row.recordingId, step: "drive" })}
                  >
                    Drive আবার চেষ্টা
                  </Button>
                )}
                {aiStuck && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate({ recordingId: row.recordingId, step: "analysis" })}
                  >
                    ট্রান্সক্রিপ্ট / এআই আবার চেষ্টা
                  </Button>
                )}
                {row.overall === "completed" && (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-3.5" /> সব ধাপ শেষ
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
