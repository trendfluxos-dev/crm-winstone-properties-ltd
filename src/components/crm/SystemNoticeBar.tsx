import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellRing, CheckCircle2, Info, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSystemNotices } from "@/lib/notices.functions";
import type { NoticeLevel, SystemNotice } from "@/lib/notices-types";
import { getAdminToken, useAdminToken } from "@/lib/local-session";

const STYLES: Record<NoticeLevel, { row: string; icon: string }> = {
  critical: {
    row: "border-destructive/30 bg-destructive/10",
    icon: "text-destructive",
  },
  warning: { row: "border-primary/25 bg-accent", icon: "text-primary" },
  info: { row: "border-border bg-surface-2/60", icon: "text-muted-foreground" },
};

function NoticeIcon({ level }: { level: NoticeLevel }) {
  const cls = `size-4 shrink-0 ${STYLES[level].icon}`;
  if (level === "critical") return <AlertTriangle className={cls} />;
  if (level === "warning") return <BellRing className={cls} />;
  return <Info className={cls} />;
}

function NoticeRow({ notice }: { notice: SystemNotice }) {
  return (
    <li className={`flex gap-3 rounded-xl border px-3 py-2.5 ${STYLES[notice.level].row}`}>
      <NoticeIcon level={notice.level} />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold leading-snug">{notice.title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{notice.detail}</p>
        {notice.action && (
          <p className="text-xs font-medium text-primary">করণীয়: {notice.action}</p>
        )}
      </div>
    </li>
  );
}

/**
 * Bengali system notice bar. Lives in both the IT Console and the Executive HQ,
 * and pops up once per visit when something needs attention.
 */
export function SystemNoticeBar({ surface }: { surface: "it" | "hq" }) {
  const adminToken = useAdminToken();
  const load = useServerFn(getSystemNotices);
  const [popup, setPopup] = useState(false);
  const [shown, setShown] = useState(false);

  const query = useQuery({
    queryKey: ["system-notices", Boolean(adminToken)],
    queryFn: () => load({ data: { adminToken: getAdminToken() } }),
    enabled: Boolean(adminToken),
    refetchInterval: 60_000,
  });

  const notices = query.data?.notices ?? [];
  const urgent = notices.filter((n) => n.level !== "info");

  useEffect(() => {
    if (shown || urgent.length === 0) return;
    const key = `winstone.notice.seen.${surface}`;
    if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") {
      setShown(true);
      return;
    }
    window.sessionStorage.setItem(key, "1");
    setShown(true);
    setPopup(true);
  }, [urgent.length, shown, surface]);

  if (!adminToken) return null;

  const allClear = urgent.length === 0;

  return (
    <>
      <section className="card-elevated p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {allClear ? (
              <CheckCircle2 className="size-4 text-live" />
            ) : (
              <BellRing className="size-4 text-primary" />
            )}
            সিস্টেম নোটিফিকেশন
            {!allClear && (
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                {urgent.length}
              </span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            রিফ্রেশ
          </Button>
        </div>

        {query.isError ? (
          <p className="mt-3 text-xs text-destructive">
            নোটিফিকেশন আনা যায়নি — আবার রিফ্রেশ করুন।
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {notices.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
          </ul>
        )}
      </section>

      <Dialog open={popup} onOpenChange={setPopup}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              মনোযোগ প্রয়োজন
            </DialogTitle>
            <DialogDescription>সিস্টেম চালু রাখতে নিচের বিষয়গুলো এখনই দেখুন।</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {urgent.map((notice) => (
              <NoticeRow key={notice.id} notice={notice} />
            ))}
          </ul>
          <Button className="w-full" onClick={() => setPopup(false)}>
            বুঝেছি
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
