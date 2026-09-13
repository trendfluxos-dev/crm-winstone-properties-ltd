import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneOutgoing, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { openMyReport, startMyCall } from "@/lib/call-reports.functions";
import { useAdminToken } from "@/lib/local-session";
import { cn } from "@/lib/utils";

/**
 * Calling straight from the web CRM, with the same mandatory post-call report as
 * the phone app: the call is gated, dialled through the phone's own dialler, and
 * the moment the agent marks it finished a report is opened. That is what makes a
 * web-only day appear in the shift summary and in Executive HQ exactly like an
 * app day — the summary is built from submitted reports, not from the app.
 *
 * The in-progress call is kept in localStorage, so leaving the browser for the
 * dialler and coming back does not lose the call timer.
 */
const KEY = "winstone.web.call.v1";

type Live = { leadId: string; startedAt: number };

function readLive(): Live | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Live;
    return parsed?.leadId ? parsed : null;
  } catch {
    return null;
  }
}

export function WebCallButton({
  leadId,
  phone,
  className,
  label = "কল করুন",
}: {
  leadId: string;
  phone: string;
  className?: string;
  label?: string;
}) {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const begin = useServerFn(startMyCall);
  const finish = useServerFn(openMyReport);
  const [live, setLive] = useState<Live | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Restore an in-progress call for this lead after returning from the dialler.
  useEffect(() => {
    const found = readLive();
    if (found && found.leadId === leadId) setLive(found);
  }, [leadId]);

  useEffect(() => {
    if (!live) return;
    const tick = () => setElapsed(Math.floor((Date.now() - live.startedAt) / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [live]);

  const start = useMutation({
    mutationFn: () => begin({ data: { adminToken, leadId } }),
    onSuccess: (result) => {
      if (result.blocked) {
        toast.error(result.reason);
        void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
        return;
      }
      const next: Live = { leadId, startedAt: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(next));
      setLive(next);
      window.location.href = `tel:${phone}`;
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const end = useMutation({
    mutationFn: () => {
      const seconds = live ? Math.floor((Date.now() - live.startedAt) / 1000) : 0;
      return finish({
        data: { adminToken, leadId, durationSeconds: seconds, connected: seconds >= 10 },
      });
    },
    onSuccess: () => {
      localStorage.removeItem(KEY);
      setLive(null);
      toast.success("কল শেষ — এখন রিপোর্টটি পূরণ করুন");
      void queryClient.invalidateQueries({ queryKey: ["pending-call-report"] });
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (live) {
    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");
    return (
      <Button
        type="button"
        size="lg"
        variant="destructive"
        className={cn("h-11 min-w-0 flex-1 rounded-xl text-base font-semibold", className)}
        disabled={end.isPending}
        onClick={() => end.mutate()}
      >
        {end.isPending ? <Loader2 className="size-5 animate-spin" /> : <Square className="size-5" />}
        <span className="tabular">
          কল শেষ · {mm}:{ss}
        </span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      className={cn(
        "h-11 min-w-0 flex-1 rounded-xl text-base font-semibold shadow-sm",
        className,
      )}
      disabled={start.isPending}
      onClick={() => start.mutate()}
      title="কল করুন — কল শেষে রিপোর্ট বাধ্যতামূলক"
    >
      {start.isPending ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <PhoneOutgoing className="size-5" />
      )}
      {label}
    </Button>
  );
}
