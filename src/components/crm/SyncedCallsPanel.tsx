import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, PhoneCall, RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { recentSyncedCalls } from "@/lib/day-export.functions";
import { getAdminToken } from "@/lib/local-session";

const RECORDING_TEXT: Record<string, string> = {
  not_available: "রেকর্ডিং সম্ভব হয়নি",
  pending: "অডিও আসছে",
  uploading: "অডিও আসছে",
  missing: "অডিও জমা নেই",
  failed: "অডিও জমা হয়নি",
  stored: "জমা হয়েছে",
};

/**
 * Live "just synced" call list for HQ and IT Console: call time, talk time and a
 * signed recording link the moment a call lands from the agent app.
 */
export function SyncedCallsPanel() {
  const run = useServerFn(recentSyncedCalls);
  const query = useQuery({
    queryKey: ["synced-calls"],
    queryFn: () => run({ data: { adminToken: getAdminToken(), limit: 30 } }),
    refetchInterval: 20_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel("synced-calls")
      .on("postgres_changes", { event: "*", schema: "public", table: "call_recordings" }, () => {
        void query.refetch();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = query.data;

  return (
    <section className="card-elevated p-4">
      <header className="flex flex-wrap items-center gap-2">
        <PhoneCall className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">সিংক হওয়া কল · সময়, কথার সময় ও রেকর্ডিং</h2>
        {data && (
          <span className="text-xs text-muted-foreground">
            {data.totals.calls}টি কল · কথা {data.totals.talkLabel} · {data.totals.recordings}টি
            রেকর্ডিং
          </span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          রিফ্রেশ
        </Button>
      </header>

      <p className="mt-1 text-xs text-muted-foreground">
        এজেন্টের ফোন থেকে কল সিংক হলেই এখানে সাথে সাথে আসে — কলের সময়, মোট কথার সময় আর জমা হওয়া
        রেকর্ডিং শোনার লিংক। অডিও জমা না থাকলে লিংকের বদলে আসল অবস্থা লেখা থাকে।
      </p>

      {query.isError && (
        <p className="mt-3 text-sm text-destructive">{(query.error as Error).message}</p>
      )}

      {data && data.calls.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">এখনো কোনো কল সিংক হয়নি।</p>
      )}

      {data && data.calls.length > 0 && (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3">কলের সময়</th>
                <th className="py-1.5 pr-3">এজেন্ট</th>
                <th className="py-1.5 pr-3">লিড</th>
                <th className="py-1.5 pr-3">নম্বর</th>
                <th className="py-1.5 pr-3">কথার সময়</th>
                <th className="py-1.5">রেকর্ডিং</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.calls.map((call) => (
                <tr key={call.id}>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{call.atDhaka}</td>
                  <td className="py-1.5 pr-3">{call.agentName}</td>
                  <td className="py-1.5 pr-3">{call.leadName}</td>
                  <td className="tabular py-1.5 pr-3 text-xs">{call.phone}</td>
                  <td className="tabular py-1.5 pr-3">{call.durationLabel}</td>
                  <td className="py-1.5 text-xs">
                    {call.audioUrl ? (
                      <a
                        href={call.audioUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        শুনুন
                      </a>
                    ) : (
                      <Badge variant="outline">
                        {RECORDING_TEXT[call.recordingStatus] ?? call.recordingStatus}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
