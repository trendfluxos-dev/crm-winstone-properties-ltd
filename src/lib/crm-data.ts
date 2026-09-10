import { queryOptions } from "@tanstack/react-query";

import type { Database } from "@/integrations/supabase/types";
import { getCrmSnapshot } from "@/lib/crm.functions";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type CallRecording = Database["public"]["Tables"]["call_recordings"]["Row"];
export type WhatsappMessage = Database["public"]["Tables"]["whatsapp_interactions"]["Row"];
export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export const LEAD_STATUSES: { key: LeadStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up", label: "Follow-up" },
  { key: "closed", label: "Closed" },
];

/** One server round-trip for the whole board; refreshed on a timer as a realtime fallback. */
export const snapshotQuery = queryOptions({
  queryKey: ["crm-snapshot"],
  queryFn: () => getCrmSnapshot(),
  refetchInterval: 15_000,
  staleTime: 5_000,
});

export type CrmSnapshot = Awaited<ReturnType<typeof getCrmSnapshot>>;

export const CONNECTED_THRESHOLD_SECONDS = 10;

export type AgentStats = {
  profile: Profile;
  dials: number;
  connected: number;
  talkSeconds: number;
  avgCallSeconds: number;
  whatsappTouches: number;
  syncedAudio: number;
  closedWon: number;
  assigned: number;
  conversionRate: number;
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function buildAgentStats(
  profiles: Profile[],
  leads: Lead[],
  calls: CallRecording[],
  messages: WhatsappMessage[],
  todayOnly = false,
): AgentStats[] {
  const agents = profiles.filter((p) => p.role === "agent" || p.role === "team_leader");
  const inWindow = (iso: string) => (todayOnly ? isToday(iso) : true);

  return agents
    .map((profile) => {
      const agentCalls = calls.filter(
        (c) => c.agent_id === profile.id && inWindow(c.created_at),
      );
      const agentMessages = messages.filter(
        (m) => m.agent_id === profile.id && m.sender_type === "agent" && inWindow(m.created_at),
      );
      const assignedLeads = leads.filter((l) => l.assigned_to === profile.id);
      const closedWon = assignedLeads.filter(
        (l) => l.status === "closed" && l.outcome_category === "deal_won",
      ).length;
      const connected = agentCalls.filter(
        (c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS,
      ).length;

      const talkSeconds = agentCalls.reduce((sum, c) => sum + c.duration_seconds, 0);
      return {
        profile,
        dials: agentCalls.length,
        connected,
        talkSeconds,
        avgCallSeconds: connected ? talkSeconds / connected : 0,
        whatsappTouches: agentMessages.length,
        syncedAudio: agentCalls.filter((c) => c.sync_status === "verified").length,
        closedWon,
        assigned: assignedLeads.length,
        conversionRate: assignedLeads.length ? (closedWon / assignedLeads.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.connected - a.connected || b.talkSeconds - a.talkSeconds);
}

export type TimelineEntry =
  | { kind: "call"; at: string; call: CallRecording }
  | { kind: "message"; at: string; message: WhatsappMessage };

export function buildTimeline(
  calls: CallRecording[],
  messages: WhatsappMessage[],
  leadId: string,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...calls
      .filter((c) => c.lead_id === leadId)
      .map((call) => ({ kind: "call" as const, at: call.created_at, call })),
    ...messages
      .filter((m) => m.lead_id === leadId)
      .map((message) => ({ kind: "message" as const, at: message.created_at, message })),
  ];
  return entries.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

export function latestVerifiedCall(calls: CallRecording[], leadId: string) {
  return calls
    .filter((c) => c.lead_id === leadId && c.sync_status === "verified" && c.ai_summary)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

/** Default carrier estimate in BDT per outgoing minute (editable on the IT board). */
export const DEFAULT_RATE_PER_MINUTE = 0.4;

export type BillingSummary = {
  monthLabel: string;
  dials: number;
  connected: number;
  connectedPct: number;
  billableMinutes: number;
  carrierCost: number;
  aiAnalysed: number;
  dealsWon: number;
  newLeads: number;
};

function sameMonth(iso: string, ref: Date) {
  const d = new Date(iso);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** Monthly telephony + floor billing rollup, computed from synced recordings. */
export function buildBillingSummary(
  calls: CallRecording[],
  leads: Lead[],
  ratePerMinute = DEFAULT_RATE_PER_MINUTE,
  ref = new Date(),
): BillingSummary {
  const monthCalls = calls.filter((c) => sameMonth(c.created_at, ref));
  const connected = monthCalls.filter(
    (c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS,
  ).length;
  const billableMinutes = monthCalls.reduce(
    (sum, c) => sum + Math.ceil(c.duration_seconds / 60),
    0,
  );
  return {
    monthLabel: ref.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    dials: monthCalls.length,
    connected,
    connectedPct: monthCalls.length ? (connected / monthCalls.length) * 100 : 0,
    billableMinutes,
    carrierCost: billableMinutes * ratePerMinute,
    aiAnalysed: monthCalls.filter((c) => c.ai_summary).length,
    dealsWon: leads.filter(
      (l) =>
        l.status === "closed" &&
        l.outcome_category === "deal_won" &&
        sameMonth(l.updated_at, ref),
    ).length,
    newLeads: leads.filter((l) => sameMonth(l.created_at, ref)).length,
  };
}
