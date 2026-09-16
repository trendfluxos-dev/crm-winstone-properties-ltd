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
