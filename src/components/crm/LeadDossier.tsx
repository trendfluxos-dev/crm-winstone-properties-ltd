import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  BadgeCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  PhoneIncoming,
  PhoneOutgoing,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CallAudioPlayer } from "@/components/crm/CallAudioPlayer";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CallRecording, Lead, Profile, TimelineEntry, WhatsappMessage } from "@/lib/crm-data";
import { reanalyzeRecording } from "@/lib/crm.functions";
import { getAdminToken } from "@/lib/local-session";
import {
  clockTime,
  dayLabel,
  digitsOnly,
  formatDuration,
  parseTranscript,
  summaryBullets,
} from "@/lib/crm-format";
import { cn } from "@/lib/utils";

const SENTIMENT_STYLES: Record<string, string> = {
  positive: "bg-live/15 text-live border-live/30",
  neutral: "bg-secondary text-secondary-foreground border-border",
  negative: "bg-idle/15 text-idle border-idle/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

export function LeadDossier({
  lead,
  timeline,
  agents,
  open,
  onOpenChange,
}: {
  lead: Lead | null;
  timeline: TimelineEntry[];
  agents: Profile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const agent = agents.find((a) => a.id === lead?.assigned_to);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {lead && (
          <>
            <SheetHeader className="border-b border-border bg-surface px-5 py-4">
              <SheetTitle className="text-xl">{lead.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {lead.company ? `${lead.company} · ` : ""}
                <span className="tabular">{lead.phone_number}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-border bg-card px-2.5 py-1 capitalize">
                  {lead.status.replace("_", " ")}
                </span>
                {lead.outcome_category && (
                  <span className="rounded-full border border-border bg-card px-2.5 py-1">
                    {lead.outcome_category.replace(/_/g, " ")}
                  </span>
                )}
                <span className="rounded-full border border-border bg-card px-2.5 py-1">
                  {lead.call_attempts} attempt{lead.call_attempts === 1 ? "" : "s"}
                </span>
                {agent && (
                  <span className="rounded-full border border-border bg-card px-2.5 py-1">
                    {agent.name}
                  </span>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button asChild size="sm" className="flex-1">
                  <a href={`tel:${lead.phone_number}`}>
                    <PhoneOutgoing className="size-4" /> Direct Dial
                  </a>
                </Button>
                <Button asChild size="sm" variant="secondary" className="flex-1">
                  <a
                    href={`https://wa.me/${digitsOnly(lead.phone_number)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="size-4" /> WhatsApp Chat
                  </a>
                </Button>
              </div>
            </SheetHeader>

            <div className="space-y-4 px-5 py-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Omnichannel timeline
              </h3>

              {timeline.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No calls or messages logged for this lead yet.
                </p>
              )}

              {timeline.map((entry) =>
                entry.kind === "call" ? (
                  <CallEntry key={entry.call.id} call={entry.call} />
                ) : (
                  <MessageEntry key={entry.message.id} message={entry.message} />
                ),
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function CallEntry({ call }: { call: CallRecording }) {
  const [seekRequest, setSeekRequest] = useState<{ at: number; nonce: number } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const transcript = parseTranscript(call.transcription_text);
  const bullets = summaryBullets(call.ai_summary);
  const queryClient = useQueryClient();
  const runAnalysis = useServerFn(reanalyzeRecording);

  const analysis = useMutation({
    mutationFn: () => {
      const adminToken = getAdminToken();
      if (!adminToken) throw new Error("Unlock the control board with the admin PIN first");
      return runAnalysis({ data: { adminToken, recordingId: call.id } });
    },
    onSuccess: () => {
      toast.success("AI analysis updated");
      void queryClient.invalidateQueries({ queryKey: ["call_recordings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <article className="card-elevated">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
        <span className="grid size-8 place-items-center rounded-full bg-primary/15 text-primary">
          {call.call_direction === "outgoing" ? (
            <PhoneOutgoing className="size-4" />
          ) : (
            <PhoneIncoming className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {call.call_direction === "outgoing" ? "SIM call placed" : "Customer called back"}
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {dayLabel(call.created_at)} · {clockTime(call.created_at)} ·{" "}
            {formatDuration(call.duration_seconds)}
          </p>
        </div>
        <span
          className={cn(
            "ml-auto flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
            call.is_two_sided
              ? "border-verified/30 bg-verified/10 text-verified"
              : "border-idle/30 bg-idle/10 text-idle",
          )}
        >
          {call.is_two_sided ? (
            <>
              <BadgeCheck className="size-3.5" /> Two-Sided Audio Verified
            </>
          ) : (
            <>
              <ShieldAlert className="size-3.5" /> One-Sided / Review Needed
            </>
          )}
        </span>
      </header>

      <div className="space-y-4 p-4">
        {call.audio_url ? (
          <CallAudioPlayer
            recordingId={call.id}
            fallbackDuration={call.duration_seconds}
            seekRequest={seekRequest}
            onTimeUpdate={setCurrentTime}
          />
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            <AlertTriangle className="size-4" /> No audio synced from the device for this call.
          </p>
        )}

        {bullets.length > 0 && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <Sparkles className="size-4" /> AI call intelligence
              </p>
              {call.sentiment && (
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs capitalize",
                    SENTIMENT_STYLES[call.sentiment],
                  )}
                >
                  {call.sentiment}
                </span>
              )}
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              {bullets.slice(0, 3).map((bullet) => (
                <li key={bullet} className="flex gap-2">
                  <span className="text-primary">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            {call.customer_objections.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {call.customer_objections.map((objection) => (
                  <span
                    key={objection}
                    className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive"
                  >
                    {objection}
                  </span>
                ))}
              </div>
            )}
            {call.deal_stage && (
              <p className="mt-3 text-xs text-muted-foreground">
                Deal stage: <span className="text-foreground">{call.deal_stage.replace(/_/g, " ")}</span>
              </p>
            )}
          </div>
        )}

        {transcript.length > 0 ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
              Transcript — click a line to listen
            </p>
            <ol className="space-y-1">
              {transcript.map((line, index) => {
                const next = transcript[index + 1];
                const active = currentTime >= line.at && (!next || currentTime < next.at);
                return (
                  <li key={`${line.at}-${index}`}>
                    <button
                      onClick={() => setSeekRequest({ at: line.at, nonce: Date.now() })}
                      className={cn(
                        "flex w-full gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-secondary",
                        active && "bg-primary/10",
                      )}
                    >
                      <span className="tabular shrink-0 text-xs text-muted-foreground">
                        {formatDuration(line.at)}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          line.speaker.toLowerCase().startsWith("agent")
                            ? "text-primary"
                            : "text-idle",
                        )}
                      >
                        {line.speaker}
                      </span>
                      <span className="min-w-0">{line.text}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          call.audio_url && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => analysis.mutate()}
              disabled={analysis.isPending}
            >
              {analysis.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Run AI transcription
            </Button>
          )
        )}
      </div>
    </article>
  );
}

const MESSAGE_ICON = {
  text: MessageCircle,
  voice_note: Mic,
  image: ImageIcon,
  document: FileText,
} as const;

function MessageEntry({ message }: { message: WhatsappMessage }) {
  const fromAgent = message.sender_type === "agent";
  const Icon = MESSAGE_ICON[message.message_type];

  return (
    <div className={cn("flex", fromAgent ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl border px-3.5 py-2.5",
          fromAgent
            ? "border-whatsapp/25 bg-whatsapp/10 rounded-br-sm"
            : "border-border bg-card rounded-bl-sm",
        )}
      >
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Icon className="size-3" />
          {fromAgent ? "Agent" : "Customer"} · WhatsApp
          {message.message_type === "voice_note" && message.duration_seconds
            ? ` · ${formatDuration(message.duration_seconds)}`
            : ""}
        </p>
        <p className="mt-1 text-sm">{message.message_content}</p>
        <p className="tabular mt-1 text-right text-[11px] text-muted-foreground">
          {clockTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
