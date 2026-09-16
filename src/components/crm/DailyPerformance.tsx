import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CloudOff, PhoneCall, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

import { formatTalkTime } from "@/lib/crm-format";
import { getMyDailyPerformance } from "@/lib/daily-performance.functions";
import { useAdminToken } from "@/lib/local-session";
import { readQueue, subscribeQueue } from "@/lib/offline-queue";

/**
 * Today's real numbers for the signed-in agent, counted on the server from
 * production rows in the Dhaka day. Nothing here is a score or a motivational
 * figure; a metric the CRM does not record is shown as "ট্র্যাক হয় না".
 */
export function DailyPerformance() {
  const adminToken = useAdminToken();
  const fetchDaily = useServerFn(getMyDailyPerformance);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => subscribeQueue((items) => setQueued(items.length)), []);
  useEffect(() => {
    setQueued(readQueue().length);
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const { data, isPending, isError } = useQuery({
    queryKey: ["daily-performance", adminToken ?? "account"],
    queryFn: () => fetchDaily({ data: { adminToken: adminToken ?? null } }),
    refetchInterval: 60_000,
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Daily Performance</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight">আজকের কাজ</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            ঢাকা সময়ের আজকের দিন — সব সংখ্যা সার্ভারের আসল রেকর্ড থেকে।
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
            online ? "border-success/40 text-success" : "border-destructive/40 text-destructive"
          }`}
        >
          {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5" />}
          {online ? "অনলাইন" : "অফলাইন"}
          {queued > 0 ? ` · ${queued} সিঙ্ক বাকি` : ""}
        </span>
      </div>

      {isError ? (
        <p className="mt-4 text-sm text-destructive">আজকের হিসাব আনা যায়নি।</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="কল করা" value={isPending ? null : data?.callsMade} />
          <Metric label="সংযুক্ত" value={isPending ? null : data?.connected} />
          <Metric label="আগ্রহী" value={isPending ? null : data?.interested} />
          <Metric label="ফলো-আপ বাকি" value={isPending ? null : data?.followUpsDue} />
          <Metric label="ফলো-আপ সম্পন্ন" value={isPending ? null : data?.followUpsCompleted} />
          <Metric label="রিপোর্ট জমা" value={isPending ? null : data?.reportsSubmitted} />
          <Metric
            label="কথা বলার সময়"
            text={isPending ? null : formatTalkTime(data?.talkSeconds ?? 0)}
          />
          <Metric label="সাইট ভিজিট" text="ট্র্যাক হয় না" muted />
        </div>
      )}

      {data?.pendingReport ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-destructive">
          <PhoneCall className="size-3.5" /> আগের কলের রিপোর্ট জমা বাকি — জমা না দিলে পরের কল হবে
          না।
        </p>
      ) : data && !isPending ? (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="size-3.5 text-success" /> কোনো রিপোর্ট বাকি নেই।
        </p>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  text,
  muted,
}: {
  label: string;
  value?: number | null;
  text?: string | null;
  muted?: boolean;
}) {
  const shown = text ?? (value === null || value === undefined ? "—" : String(value));
  return (
    <div className="rounded-xl border border-border/70 bg-background/40 px-3 py-2.5">
      <dd
        className={`text-2xl font-semibold tabular-nums ${
          muted ? "text-sm font-medium text-muted-foreground" : "text-foreground"
        }`}
      >
        {shown}
      </dd>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
