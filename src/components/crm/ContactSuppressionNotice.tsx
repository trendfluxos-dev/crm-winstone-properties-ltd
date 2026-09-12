import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Mic, MicOff } from "lucide-react";

import { leadContactStatus } from "@/lib/contact-status.functions";

/** Shows the server-held opt-out and recording state for one lead. */
export function ContactSuppressionNotice({ leadId }: { leadId: string }) {
  const fetchStatus = useServerFn(leadContactStatus);
  const { data } = useQuery({
    queryKey: ["lead-contact-status", leadId],
    queryFn: () => fetchStatus({ data: { leadId } }),
    staleTime: 30_000,
    retry: false,
  });

  if (!data) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      {data.optedOut ? (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-1 font-medium text-destructive">
          <Ban className="size-3.5" /> যোগাযোগ বন্ধ (গ্রাহক নিষেধ করেছেন)
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1">
        {data.recordingAllowed ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
        {data.recordingAllowed
          ? "রেকর্ডিং অনুমোদিত"
          : data.recordingConsent === "opted_out"
            ? "রেকর্ডিং বন্ধ (গ্রাহক রাজি নন)"
            : data.recordingNoticeConfigured
              ? "রেকর্ডিং বন্ধ"
              : "রেকর্ডিং সম্মতি নেই"}
      </span>
      {data.optedOut && data.reason ? <span className="text-muted-foreground">{data.reason}</span> : null}
    </div>
  );
}
