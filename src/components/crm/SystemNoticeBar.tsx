import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellRing, Check, CheckCircle2, Info, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { decideAccount, listAccountRequests } from "@/lib/accounts.functions";
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

/**
 * Approve / deny straight from the notification, so IT never has to go hunting
 * for the approvals list. The server re-checks the IT PIN on every decision.
 */
function PendingAccountActions() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const decide = useServerFn(decideAccount);

  const list = useQuery({
    queryKey: ["account-requests"],
    queryFn: () => listAccountRequests({ data: { adminToken: adminToken ?? "" } }),
    enabled: Boolean(adminToken),
  });

  // Locks the row while its decision is in flight, so a double tap cannot
  // submit twice, and keeps the result visible until the list refreshes.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "approved" | "rejected">>({});

  const act = useMutation({
    mutationFn: (input: {
      profileId: string;
      decision: "approve_agent" | "approve_coordinator" | "reject";
    }) => decide({ data: { adminToken: getAdminToken() ?? "", ...input } }),
    onMutate: (input) => setBusyId(input.profileId),
    onSuccess: async (_result, input) => {
      setDone((prev) => ({
        ...prev,
        [input.profileId]: input.decision === "reject" ? "rejected" : "approved",
      }));
      toast.success(
        input.decision === "reject"
          ? "অ্যাকাউন্ট বাতিল হয়েছে — ডেস্কে ঢোকা বন্ধ"
          : "অনুমোদন হয়েছে — এখন ডেস্কে ঢুকতে পারবেন",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["account-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["system-notices"] }),
        queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["staff-accounts"] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message || "কাজটি সম্পন্ন হয়নি — আবার চেষ্টা করুন"),
    onSettled: () => setBusyId(null),
  });

  const pending = (list.data?.accounts ?? []).filter(
    (a) => a.approval_status === "pending" || done[a.id],
  );
  if (list.isPending && adminToken) {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> অপেক্ষমাণ অ্যাকাউন্ট আনা হচ্ছে…
      </p>
    );
  }
  if (pending.length === 0) return null;

  return (
    <ul className="mt-2 space-y-2">
      {pending.map((account) => (
        <li
          key={account.id}
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold">{account.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {account.email ?? "ইমেইল নেই"} · চেয়েছেন{" "}
              {account.requested_role === "team_leader" ? "কোঅর্ডিনেটর" : "এজেন্ট"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={act.isPending}
              onClick={() => act.mutate({ profileId: account.id, decision: "approve_agent" })}
            >
              {act.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              এজেন্ট
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              disabled={act.isPending}
              onClick={() => act.mutate({ profileId: account.id, decision: "approve_coordinator" })}
            >
              কোঅর্ডিনেটর
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 text-xs"
              disabled={act.isPending}
              onClick={() => act.mutate({ profileId: account.id, decision: "reject" })}
            >
              <X className="size-3.5" /> বাদ দিন
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function NoticeRow({ notice, canAct }: { notice: SystemNotice; canAct: boolean }) {
  return (
    <li className={`rounded-xl border px-3 py-2.5 ${STYLES[notice.level].row}`}>
      <div className="flex gap-3">
        <NoticeIcon level={notice.level} />
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold leading-snug">{notice.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{notice.detail}</p>
          {notice.action && (
            <p className="text-xs font-medium text-primary">করণীয়: {notice.action}</p>
          )}
        </div>
      </div>
      {canAct && notice.id === "pending-accounts" && <PendingAccountActions />}
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
              <NoticeRow key={notice.id} notice={notice} canAct={surface === "it"} />
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
              <NoticeRow key={notice.id} notice={notice} canAct={surface === "it"} />
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
