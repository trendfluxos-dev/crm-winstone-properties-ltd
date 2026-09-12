import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getCrmSnapshot } from "@/lib/crm.functions";
import { useAdminToken } from "@/lib/local-session";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type CallRecording = Database["public"]["Tables"]["call_recordings"]["Row"];
export type WhatsappMessage = Database["public"]["Tables"]["whatsapp_interactions"]["Row"];
export type LeadEvent = Database["public"]["Tables"]["lead_events"]["Row"];
export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export const LEAD_STATUSES: { key: LeadStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "contacted", label: "Contacted" },
  { key: "follow_up", label: "Follow-up" },
  { key: "closed", label: "Closed" },
];

export type CrmSnapshot = Awaited<ReturnType<typeof getCrmSnapshot>>;

/**
 * One server round-trip for the board, scoped to who is asking.
 * Authority PIN and coordinators see the whole floor, an agent sees only
 * their own leads, and anyone else receives an empty snapshot.
 */
export const snapshotQueryFor = (scope: { token: string | null }) =>
  queryOptions({
    queryKey: ["crm-snapshot", scope.token ? "authority" : "session"],
    queryFn: () => getCrmSnapshot({ data: { token: scope.token } }),
    refetchInterval: 10_000,
    staleTime: 2_000,
  });

const EMPTY_SNAPSHOT = {
  profiles: [] as Profile[],
  leads: [] as Lead[],
  calls: [] as CallRecording[],
  messages: [] as WhatsappMessage[],
  events: [] as LeadEvent[],
};

/**
 * Live push refresh: whenever the phone app writes a call lifecycle event, a
 * recording or a WhatsApp message, the board reloads itself — no manual refresh.
 * The 10s poll above stays as a safety net for PIN-only (not signed-in) boards.
 */
function useLiveCrmRefresh() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["crm-snapshot"] });
    };
    // Each snapshot consumer mounts its own listener. Reusing one channel name
    // makes the client return an already-subscribed channel, then adding another
    // callback throws and takes down the whole desk.
    const channel = supabase
      .channel(`crm-snapshot-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lead_events" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "call_recordings" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, invalidate)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_interactions" },
        invalidate,
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);
}

/** Snapshot for the current device; customer data requires an authority token. */
export function useSnapshot() {
  const token = useAdminToken();
  const query = useQuery(snapshotQueryFor({ token }));
  useLiveCrmRefresh();
  return { ...(query.data ?? EMPTY_SNAPSHOT), isPending: query.isPending };
}

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
  | { kind: "message"; at: string; message: WhatsappMessage }
  | { kind: "event"; at: string; event: LeadEvent };

/** Bengali labels for the automatic call lifecycle trail. */
export const LEAD_EVENT_LABELS: Record<string, string> = {
  call_started: "কল শুরু হয়েছে",
  call_connected: "কল সংযুক্ত হয়েছে",
  call_ended: "কল শেষ হয়েছে",
  recording_saved: "রেকর্ডিং সার্ভারে জমা হয়েছে",
  transcript_ready: "ট্রান্সক্রিপ্ট প্রস্তুত",
  transcript_failed: "ট্রান্সক্রিপ্ট তৈরি হয়নি",
  outcome_logged: "কলের ফল জমা হয়েছে",
  whatsapp_message: "হোয়াটসঅ্যাপ কথা হয়েছে",
  self_claimed: "এজেন্ট নিজে লিড নিয়েছেন",
};

export function buildTimeline(
  calls: CallRecording[],
  messages: WhatsappMessage[],
  leadId: string,
  events: LeadEvent[] = [],
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...calls
      .filter((c) => c.lead_id === leadId)
      .map((call) => ({ kind: "call" as const, at: call.created_at, call })),
    ...messages
      .filter((m) => m.lead_id === leadId)
      .map((message) => ({ kind: "message" as const, at: message.created_at, message })),
    ...events
      .filter((e) => e.lead_id === leadId)
      .map((event) => ({ kind: "event" as const, at: event.created_at, event })),
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
