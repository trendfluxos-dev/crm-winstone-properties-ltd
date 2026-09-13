import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, ClipboardList, Loader2, Pencil } from "lucide-react";
import { useState } from "react";

import { ReportEditDialog, type EditableReport } from "@/components/crm/ReportEditDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABEL_CLIENT } from "@/lib/call-categories";
import { myCallReports } from "@/lib/call-reports.functions";
import { clockTime, relativeTime } from "@/lib/crm-format";
import { useAdminToken } from "@/lib/local-session";

/** The agent's own call reports and the follow-up work waiting for them. */
export function MyReports() {
  const adminToken = useAdminToken();
  const fetchReports = useServerFn(myCallReports);
  const [editing, setEditing] = useState<EditableReport | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ["my-call-reports", adminToken ? "pin" : "session"],
    queryFn: () => fetchReports({ data: { adminToken } }),
    refetchInterval: 60_000,
  });

  if (isPending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> রিপোর্ট আনা হচ্ছে…
      </p>
    );
  }

  const reports = data?.reports ?? [];
  const upcoming = data?.upcoming ?? [];

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <CalendarClock className="size-5 text-primary" /> আপকমিং কাজ
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">
            {upcoming.length}টি কাজ বাকি
            {data?.overdueCount ? ` · ${data.overdueCount}টির সময় পার হয়েছে` : ""}
          </p>
        </div>
        {upcoming.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            এখন কোনো ফলো-আপ বাকি নেই।
          </p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {event.customer_name ?? event.phone_number ?? "কাস্টমার"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABEL_CLIENT[event.category] ?? event.category} ·{" "}
                    {clockTime(event.scheduled_at)} · {relativeTime(event.scheduled_at)}
                  </p>
                </div>
                <Badge variant={event.priority === "high" ? "destructive" : "secondary"}>
                  {event.priority === "high" ? "জরুরি" : "সাধারণ"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <ClipboardList className="size-5 text-primary" /> আমার কল রিপোর্ট
          </h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{reports.length}টি রিপোর্ট</p>
        </div>
        {reports.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            এখনো কোনো কল রিপোর্ট জমা হয়নি।
          </p>
        ) : (
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.id} className="rounded-lg border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {report.lead?.name ?? "লিড"}{" "}
                    <span className="font-normal text-muted-foreground">
                      {report.lead?.phone_number ?? ""}
                    </span>
                  </p>
                  <Badge variant={report.status === "pending" ? "destructive" : "secondary"}>
                    {report.status === "pending"
                      ? "রিপোর্ট বাকি"
                      : (report.category && CATEGORY_LABEL_CLIENT[report.category]) || "জমা হয়েছে"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.connected ? "সংযুক্ত" : "সংযোগ হয়নি"} · {report.duration_seconds}s ·{" "}
                  {relativeTime(report.call_ended_at)}
                  {report.follow_up_at ? ` · ফলো-আপ ${clockTime(report.follow_up_at)}` : ""}
                </p>
                {report.note ? <p className="mt-1 text-sm">{report.note}</p> : null}
                {report.reason ? (
                  <p className="mt-1 text-xs text-muted-foreground">কারণ: {report.reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
