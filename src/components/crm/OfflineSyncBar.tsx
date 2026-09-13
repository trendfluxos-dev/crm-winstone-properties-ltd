import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CloudOff, RefreshCw, WifiOff } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { submitMyReport, syncOfflineCallEvent } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";
import { flushQueue, markPending, type OfflineItem, subscribeQueue } from "@/lib/offline-queue";

/**
 * Honest offline status strip: how many actions are still only on this phone,
 * and a retry for the ones whose sync failed. Nothing here is ever shown as
 * "reached the server" until the server accepted it.
 */
export function OfflineSyncBar() {
  const adminToken = useAdminToken();
  const [items, setItems] = useState<OfflineItem[]>([]);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const sendCall = useServerFn(syncOfflineCallEvent);
  const sendReport = useServerFn(submitMyReport);

  useEffect(() => subscribeQueue(setItems), []);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setBusy(true);
    const result = await flushQueue({
      call_event: (payload) => sendCall({ data: { ...payload, adminToken } as never }),
      report_submit: (payload) => sendReport({ data: { ...payload, adminToken } as never }),
    });
    setBusy(false);
    if (result.synced) {
      toast.success(`${result.synced}টি অফলাইন কাজ সার্ভারে জমা হয়েছে`);
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
      void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
      void queryClient.invalidateQueries({ queryKey: ["my-call-reports"] });
    }
  }, [adminToken, queryClient, sendCall, sendReport]);

  useEffect(() => {
    if (online && items.length) void flush();
  }, [online, items.length, flush]);

  if (!items.length && online) return null;

  const failed = items.filter((item) => item.status === "failed");

  return (
    <div className="mb-3 space-y-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-bold">
        {online ? <CloudOff className="size-3.5" /> : <WifiOff className="size-3.5" />}
        {online
          ? items.length
            ? `${items.length}টি কাজ এখনো এই ফোনেই আছে — সার্ভারে পাঠানো হচ্ছে`
            : "সব সিঙ্ক হয়েছে"
          : "ইন্টারনেট নেই — কাজ এই ফোনে সেভ হচ্ছে, নেট ফিরলে নিজে থেকেই সার্ভারে যাবে"}
      </p>
      {items.slice(0, 5).map((item) => (
        <p key={item.id} className="text-muted-foreground">
          • {item.label} —{" "}
          {item.status === "failed" ? `পাঠানো যায়নি (${item.lastError ?? "ত্রুটি"})` : "সিঙ্ক বাকি"}
        </p>
      ))}
      {failed.length ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={busy || !online}
          onClick={() => {
            failed.forEach((item) => markPending(item.id));
            void flush();
          }}
        >
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} /> আবার চেষ্টা করুন
        </Button>
      ) : null}
    </div>
  );
}
