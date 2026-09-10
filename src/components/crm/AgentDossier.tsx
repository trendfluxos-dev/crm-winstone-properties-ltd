import { BadgeCheck, MessageCircle, PhoneCall, Timer } from "lucide-react";
import { useMemo } from "react";

import { CallEntry } from "@/components/crm/LeadDossier";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { CallRecording, Lead, Profile, WhatsappMessage } from "@/lib/crm-data";
import { CONNECTED_THRESHOLD_SECONDS } from "@/lib/crm-data";
import { formatDuration, formatTalkTime, relativeTime } from "@/lib/crm-format";

/** Full audit trail for one agent: every recording with AI audit cards and transcript. */
export function AgentDossier({
  agent,
  leads,
  calls,
  messages,
  open,
  onOpenChange,
}: {
  agent: Profile | null;
  leads: Lead[];
  calls: CallRecording[];
  messages: WhatsappMessage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const agentCalls = useMemo(
    () =>
      calls
        .filter((c) => c.agent_id === agent?.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [calls, agent?.id],
  );
  const touches = messages.filter((m) => m.agent_id === agent?.id && m.sender_type === "agent").length;
  const connected = agentCalls.filter((c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS);
  const talk = agentCalls.reduce((s, c) => s + c.duration_seconds, 0);
  const verified = agentCalls.filter((c) => c.is_two_sided || c.sync_status === "verified").length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {agent && (
          <>
            <SheetHeader className="border-b border-border bg-surface px-5 py-4">
              <SheetTitle className="text-xl">{agent.name}</SheetTitle>
              <p className="text-sm text-muted-foreground">
                {agent.employee_id ? `${agent.employee_id} · ` : ""}
                <span className="capitalize">{agent.role.replace("_", " ")}</span>
                {" · "}
                <span className="capitalize">{agent.presence.replace("_", " ")}</span>
                {" · last active "}
                {relativeTime(agent.last_active_at)}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat icon={<PhoneCall className="size-3" />} label="Dials / connected" value={`${agentCalls.length} / ${connected.length}`} />
                <Stat icon={<Timer className="size-3" />} label="Talk · avg" value={`${formatTalkTime(talk)} · ${connected.length ? formatDuration(talk / connected.length) : "--:--"}`} />
                <Stat icon={<MessageCircle className="size-3" />} label="WhatsApp" value={String(touches)} />
                <Stat icon={<BadgeCheck className="size-3 text-verified" />} label="Verified audio" value={String(verified)} />
              </dl>
            </SheetHeader>

            <div className="space-y-4 px-5 py-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Call audit trail
              </h3>
              {agentCalls.length === 0 && (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No recordings synced from this agent yet.
                </p>
              )}
              {agentCalls.map((call) => {
                const lead = leads.find((l) => l.id === call.lead_id);
                return (
                  <div key={call.id} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      Lead:{" "}
                      <span className="font-medium text-foreground">{lead?.name ?? "Unknown"}</span>
                      {lead?.company ? ` · ${lead.company}` : ""}
                    </p>
                    <CallEntry call={call} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5">
      <dt className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="tabular mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
