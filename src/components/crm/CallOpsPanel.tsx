import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  BellRing,
  Check,
  Loader2,
  RefreshCw,
  ShieldOff,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  acknowledgeAlert,
  callOpsSummary,
  revokeAgentDevice,
  runAnalysisSweep,
} from "@/lib/ops.functions";
import { useAdminToken } from "@/lib/local-session";

const RECORDING_LABEL: Record<string, string> = {
  two_sided: "রেকর্ডিং: দুই পাশের কথা",
  mic_only: "রেকর্ডিং: শুধু এজেন্টের পাশ",
  unavailable: "এই ফোনে রেকর্ডিং সম্ভব নয়",
};

const CATEGORY_LABEL: Record<string, string> = {
  hot_lead: "HOT LEAD",
  follow_up: "FOLLOW UP",
  interested: "INTERESTED",
  not_interested: "NOT INTERESTED",
  callback: "CALLBACK",
  no_answer: "NO ANSWER",
  wrong_number: "WRONG NUMBER",
  closed_converted: "CLOSED",
};

/**
 * Report + recording + AI + follow-up health for Executive HQ and IT Console.
 * Read-only apart from the manual analysis sweep and alert acknowledgement.
 */
export function CallOpsPanel({ showControls = false }: { showControls?: boolean }) {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const fetchSummary = useServerFn(callOpsSummary);
  const sweep = useServerFn(runAnalysisSweep);
  const ack = useServerFn(acknowledgeAlert);
  const revoke = useServerFn(revokeAgentDevice);

  const summary = useQuery({
    queryKey: ["call-ops", adminToken ? "pin" : "session"],
    queryFn: () => fetchSummary({ data: { adminToken } }),
    refetchInterval: 15_000,
  });

  const runSweep = useMutation({
    mutationFn: () => sweep({ data: { adminToken } }),
    onSuccess: (result) => {
      toast.success(`${result.processed}টি রেকর্ডিং বিশ্লেষণ করা হলো`);
      void queryClient.invalidateQueries({ queryKey: ["call-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const clearAlert = useMutation({
    mutationFn: (alertId: string) => ack({ data: { adminToken, alertId } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["call-ops"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const revokeDevice = useMutation({
    mutationFn: (deviceId: string) => revoke({ data: { adminToken, deviceId } }),
    onSuccess: () => {
      toast.success("ফোনটির প্রবেশ বাতিল করা হলো");
      void queryClient.invalidateQueries({ queryKey: ["call-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = summary.data;

  return (
    <section className="card-elevated space-y-4 p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <Activity className="size-4" /> কল রিপোর্ট, রেকর্ডিং ও AI অবস্থা
          </h2>
          <p className="text-xs text-muted-foreground">
            শেষ ৭ দিনের হিসাব · প্রতি ৩০ সেকেন্ডে নিজে থেকে হালনাগাদ হয়।
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => void summary.refetch()}
          >
            <RefreshCw className="size-3.5" /> রিফ্রেশ
          </Button>
          {showControls ? (
            <Button
              size="sm"
              className="gap-1.5"
              disabled={runSweep.isPending}
              onClick={() => runSweep.mutate()}
            >
              {runSweep.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              AI বিশ্লেষণ চালান
            </Button>
          ) : null}
        </div>
      </header>

      {!data ? (
        <p className="text-xs text-muted-foreground">তথ্য আসছে…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="রিপোর্ট বাকি"
              value={data.reports.pending}
              hint="জমা না দিলে পরের কল বন্ধ"
            />
            <Tile label="রিপোর্ট জমা" value={data.reports.submitted} hint="শেষ ৭ দিনে" />
            <Tile
              label="AI বিশ্লেষণ বাকি"
              value={data.analysis.pending + data.analysis.processing}
              hint={`${data.analysis.completed}টি সম্পন্ন`}
            />
            <Tile
              label="বিশ্লেষণ ব্যর্থ"
              value={data.analysis.failed}
              hint={data.analysis.lastError ?? "সব ঠিক আছে"}
            />
            <Tile label="ফলো-আপ সময় পার" value={data.followUps.overdue} hint="এখনই দেখা দরকার" />
            <Tile
              label="ফলো-আপ এখন"
              value={data.followUps.due}
              hint={`${data.followUps.upcoming}টি আসছে`}
            />
            <Tile label="খালি লিড" value={data.leads.unassigned} hint={`মোট ${data.leads.total}`} />
            <Tile
              label="শুধু এজেন্টের কণ্ঠ"
              value={data.analysis.micOnly}
              hint="ফোন দুই পক্ষের অডিও দেয়নি"
            />
            <Tile
              label="প্রসেসিং সারিতে"
              value={data.pipeline.queued + data.pipeline.processing}
              hint={`${data.pipeline.completed}টি শেষ · ${data.pipeline.retried}টি পুনরায় চেষ্টা`}
            />
            <Tile
              label="প্রসেসিং ব্যর্থ"
              value={data.pipeline.failed}
              hint={data.pipeline.lastError ?? "সব ঠিক আছে"}
            />
            <Tile
              label="ফোন থেকে আসা ইভেন্ট"
              value={data.sync.total}
              hint={`${data.sync.queued}টি অপেক্ষায় · ${data.sync.failed}টি ব্যর্থ`}
            />
          </dl>

          {Object.keys(data.reports.categories).length ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.reports.categories).map(([key, value]) => (
                <Badge key={key} variant="secondary">
                  {CATEGORY_LABEL[key] ?? key}: {value}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-bold">
              <Smartphone className="size-3.5" /> অনুমোদিত ফোন ও রেকর্ডিং ক্ষমতা
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">দুই পাশ: {data.recording?.twoSided ?? 0}</Badge>
              <Badge variant="secondary">শুধু এজেন্ট: {data.recording?.micOnly ?? 0}</Badge>
              <Badge variant="destructive">রেকর্ডিং সম্ভব নয়: {data.recording?.blocked ?? 0}</Badge>
              <Badge variant="outline">যাচাই বাকি: {data.recording?.untested ?? 0}</Badge>
            </div>
            {data.devices.length === 0 ? (
              <p className="text-xs text-muted-foreground">কোনো ফোন এখনো সাইন ইন করেনি।</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {data.devices.slice(0, 8).map((device) => (
                  <li key={device.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>
                        {device.label ?? "ফোন"} {device.appVersion ? `· v${device.appVersion}` : ""}
                      </span>
                      <Badge
                        variant={
                          device.recordingMode === "two_sided"
                            ? "secondary"
                            : device.recordingMode === "unavailable"
                              ? "destructive"
                              : "outline"
                        }
                        title={device.recordingNote ?? undefined}
                      >
                        {RECORDING_LABEL[device.recordingMode ?? ""] ?? "রেকর্ডিং যাচাই হয়নি"}
                      </Badge>
                      {device.recordingCheckedAt ? (
                        <span className="text-[10px] text-muted-foreground">
                          যাচাই: {new Date(device.recordingCheckedAt).toLocaleString("bn-BD")}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      {device.revoked
                        ? "বাতিল"
                        : device.lastSeenAt
                          ? new Date(device.lastSeenAt).toLocaleString("bn-BD")
                          : "—"}
                      {showControls && !device.revoked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 px-2 text-[11px]"
                          disabled={revokeDevice.isPending}
                          onClick={() => revokeDevice.mutate(device.id)}
                        >
                          <ShieldOff className="size-3" /> বাতিল করুন
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {data.alerts.length ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-bold text-destructive">
                <BellRing className="size-3.5" /> জরুরি সতর্কতা
              </p>
              <ul className="space-y-2">
                {data.alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs"
                  >
                    <span>
                      <strong>{alert.title}</strong> — {alert.detail ?? ""}
                    </span>
                    {showControls ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => clearAlert.mutate(alert.id)}
                      >
                        <Check className="size-3.5" /> দেখা হয়েছে
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold tabular-nums">{value}</dd>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
