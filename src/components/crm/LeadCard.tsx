import { BadgeCheck, MessageCircle, PhoneOutgoing, Repeat, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CallRecording, Lead, Profile } from "@/lib/crm-data";
import { digitsOnly, relativeTime, summaryBullets } from "@/lib/crm-format";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  pending: "border-border bg-secondary text-secondary-foreground",
  contacted: "border-primary/30 bg-primary/10 text-primary",
  follow_up: "border-idle/30 bg-idle/10 text-idle",
  closed: "border-live/30 bg-live/10 text-live",
};

export function LeadCard({
  lead,
  agent,
  verifiedCall,
  onOpen,
}: {
  lead: Lead;
  agent: Profile | undefined;
  verifiedCall: CallRecording | undefined;
  onOpen: () => void;
}) {
  const headline = summaryBullets(verifiedCall?.ai_summary ?? null)[0];

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 text-left">
          <p className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{lead.name}</span>
            {verifiedCall && (
              <BadgeCheck
                className="size-4 shrink-0 text-verified"
                aria-label="Two-sided audio verified"
              />
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.company ?? "Individual"} · <span className="tabular">{lead.phone_number}</span>
          </p>
        </button>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] capitalize",
            STATUS_STYLES[lead.status],
          )}
        >
          {lead.status.replace("_", " ")}
        </span>
      </div>

      {headline && (
        <p className="flex gap-1.5 rounded-lg bg-surface-2 p-2.5 text-xs text-muted-foreground">
          <Sparkles className="mt-0.5 size-3 shrink-0 text-primary" />
          <span className="line-clamp-2">{headline}</span>
        </p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Repeat className="size-3" /> {lead.call_attempts}
        </span>
        <span>{relativeTime(lead.last_call_at)}</span>
        <span className="ml-auto truncate">{agent?.name ?? "Unassigned"}</span>
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" className="flex-1">
          <a href={`tel:${lead.phone_number}`}>
            <PhoneOutgoing className="size-3.5" /> Call
          </a>
        </Button>
        <Button asChild size="sm" variant="secondary" className="flex-1">
          <a
            href={`https://wa.me/${digitsOnly(lead.phone_number)}`}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-3.5" /> Chat
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={onOpen}>
          Dossier
        </Button>
      </div>
    </article>
  );
}
