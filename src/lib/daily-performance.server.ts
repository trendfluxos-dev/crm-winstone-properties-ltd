import { dhakaDayKey, DHAKA_OFFSET_MS } from "@/lib/dhaka-time";

/** Same rule the desk uses: a call counts as connected past 10 seconds. */
const CONNECTED_THRESHOLD_SECONDS = 10;

/**
 * One agent's real numbers for the current Dhaka day.
 *
 * Every field below is counted from production rows. A metric the system does
 * not record is returned as null so the UI can say "tracked নয়" instead of
 * inventing a number — site visits have no source table today.
 */
export type DailyPerformance = {
  dayKey: string;
  callsMade: number;
  connected: number;
  interested: number;
  followUpsDue: number;
  /** Follow-ups marked done inside the Dhaka day — additive field, safe for older clients. */
  followUpsCompleted: number;
  siteVisits: number | null;
  reportsSubmitted: number;
  talkSeconds: number;
  pendingReport: boolean;
};

/** Start/end of today in Dhaka, as ISO instants. */
export function dhakaDayWindow(now = new Date()): { startIso: string; endIso: string } {
  const key = dhakaDayKey(now);
  const start = new Date(`${key}T00:00:00.000Z`).getTime() - DHAKA_OFFSET_MS;
  return {
    startIso: new Date(start).toISOString(),
    endIso: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

const INTERESTED_CATEGORIES = ["interested", "hot_lead", "closed_converted"];

export async function computeDailyPerformance(agentId: string): Promise<DailyPerformance> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const { startIso, endIso } = dhakaDayWindow(now);

  const [calls, reports, followUps, pending] = await Promise.all([
    supabaseAdmin
      .from("call_recordings")
      .select("duration_seconds")
      .eq("agent_id", agentId)
      .gte("created_at", startIso)
      .lt("created_at", endIso),
    supabaseAdmin
      .from("call_reports")
      .select("category, status, submitted_at")
      .eq("agent_id", agentId)
      .eq("status", "submitted")
      .gte("submitted_at", startIso)
      .lt("submitted_at", endIso),
    supabaseAdmin
      .from("follow_up_events")
      .select("id")
      .eq("agent_id", agentId)
      .neq("status", "done")
      .lte("scheduled_at", now.toISOString()),
    supabaseAdmin
      .from("call_reports")
      .select("id")
      .eq("agent_id", agentId)
      .eq("status", "pending")
      .limit(1),
  ]);

  const callRows = calls.data ?? [];
  const reportRows = reports.data ?? [];

  return {
    dayKey: dhakaDayKey(now),
    callsMade: callRows.length,
    connected: callRows.filter((c) => (c.duration_seconds ?? 0) > CONNECTED_THRESHOLD_SECONDS)
      .length,
    interested: reportRows.filter((r) => r.category && INTERESTED_CATEGORIES.includes(r.category))
      .length,
    followUpsDue: (followUps.data ?? []).length,
    // No site-visit entity exists in the production schema; never guess one.
    siteVisits: null,
    reportsSubmitted: reportRows.length,
    talkSeconds: callRows.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0),
    pendingReport: (pending.data ?? []).length > 0,
  };
}

export type TeamDailyRow = DailyPerformance & {
  agentId: string;
  agentName: string;
  employeeId: string | null;
};

export type TeamDailyPerformance = {
  dayKey: string;
  agents: TeamDailyRow[];
  totals: {
    agents: number;
    callsMade: number;
    connected: number;
    interested: number;
    followUpsDue: number;
    reportsSubmitted: number;
    talkSeconds: number;
    pendingReports: number;
  };
};

/**
 * The same Dhaka-day counters, for every active agent on the floor.
 *
 * Used by the Coordinator Deck (team view) and Executive HQ (floor view). It
 * reuses `computeDailyPerformance` per agent so one definition of "connected",
 * "interested" and "talk time" serves the agent, the coordinator and HQ —
 * no second, divergent calculation.
 */
export async function computeTeamDailyPerformance(): Promise<TeamDailyPerformance> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, name, employee_id")
    .eq("is_active", true)
    .eq("approval_status", "approved")
    .eq("role", "agent")
    .order("name");

  const rows = await Promise.all(
    (profiles ?? []).map(async (p) => ({
      ...(await computeDailyPerformance(p.id)),
      agentId: p.id,
      agentName: p.name,
      employeeId: p.employee_id,
    })),
  );

  return {
    dayKey: dhakaDayKey(),
    agents: rows,
    totals: {
      agents: rows.length,
      callsMade: rows.reduce((s, r) => s + r.callsMade, 0),
      connected: rows.reduce((s, r) => s + r.connected, 0),
      interested: rows.reduce((s, r) => s + r.interested, 0),
      followUpsDue: rows.reduce((s, r) => s + r.followUpsDue, 0),
      reportsSubmitted: rows.reduce((s, r) => s + r.reportsSubmitted, 0),
      talkSeconds: rows.reduce((s, r) => s + r.talkSeconds, 0),
      pendingReports: rows.filter((r) => r.pendingReport).length,
    },
  };
}
