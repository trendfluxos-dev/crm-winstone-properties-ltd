/**
 * Shift summary: what every agent actually did inside one working window,
 * built only from the updates the agents submitted themselves.
 * Executive HQ keeps one month of these; the IT Console keeps all of them.
 */
import { CATEGORY_LABEL } from "@/lib/report-sheet.server";
import { dhakaParts, shiftDueForSummary } from "@/lib/shift.server";

export type ShiftAgentLine = {
  agentId: string;
  name: string;
  employeeId: string | null;
  assigned: number;
  called: number;
  connected: number;
  reports: number;
  pending: number;
  followUps: number;
  categories: Record<string, number>;
};

export type ShiftSummaryRow = {
  id: string;
  shift_key: string;
  shift_label: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  hq_visible: boolean;
  totals: { called: number; connected: number; reports: number; pending: number; followUps: number };
  agents: ShiftAgentLine[];
};

/** Builds (or refreshes) the summary for the window that just closed. */
export async function generateShiftSummary(at: Date = new Date()) {
  const due = shiftDueForSummary(at);
  if (!due) return { generated: false as const, reason: "এখনো কোনো শিফট শেষ হয়নি" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startIso = due.windowStart.toISOString();
  const endIso = due.windowEnd.toISOString();

  const [agentsRes, reportsRes, leadsRes, followRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, name, employee_id")
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .eq("role", "agent"),
    supabaseAdmin
      .from("call_reports")
      .select("agent_id, status, category, connected, call_ended_at, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabaseAdmin.from("leads").select("assigned_to"),
    supabaseAdmin
      .from("follow_up_events")
      .select("agent_id, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
  ]);
  if (agentsRes.error) throw new Error(agentsRes.error.message);
  if (reportsRes.error) throw new Error(reportsRes.error.message);
  if (leadsRes.error) throw new Error(leadsRes.error.message);
  if (followRes.error) throw new Error(followRes.error.message);

  const assignedCount = new Map<string, number>();
  for (const lead of leadsRes.data ?? []) {
    if (lead.assigned_to) assignedCount.set(lead.assigned_to, (assignedCount.get(lead.assigned_to) ?? 0) + 1);
  }
  const followCount = new Map<string, number>();
  for (const row of followRes.data ?? []) {
    if (row.agent_id) followCount.set(row.agent_id, (followCount.get(row.agent_id) ?? 0) + 1);
  }

  const lines: ShiftAgentLine[] = (agentsRes.data ?? []).map((agent) => {
    const mine = (reportsRes.data ?? []).filter((r) => r.agent_id === agent.id);
    const submitted = mine.filter((r) => r.status === "submitted");
    const categories: Record<string, number> = {};
    for (const r of submitted) {
      const label = CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—";
      categories[label] = (categories[label] ?? 0) + 1;
    }
    return {
      agentId: agent.id,
      name: agent.name,
      employeeId: agent.employee_id,
      assigned: assignedCount.get(agent.id) ?? 0,
      called: mine.length,
      connected: mine.filter((r) => r.connected).length,
      reports: submitted.length,
      pending: mine.filter((r) => r.status === "pending").length,
      followUps: followCount.get(agent.id) ?? 0,
      categories,
    };
  });

  const totals = lines.reduce(
    (acc, line) => ({
      called: acc.called + line.called,
      connected: acc.connected + line.connected,
      reports: acc.reports + line.reports,
      pending: acc.pending + line.pending,
      followUps: acc.followUps + line.followUps,
    }),
    { called: 0, connected: 0, reports: 0, pending: 0, followUps: 0 },
  );

  const { error } = await supabaseAdmin.from("shift_summaries").upsert(
    {
      shift_key: due.shiftKey,
      shift_label: due.shift.label,
      window_start: startIso,
      window_end: endIso,
      generated_at: new Date().toISOString(),
      hq_visible: true,
      totals,
      agents: lines,
    },
    { onConflict: "shift_key" },
  );
  if (error) throw new Error(error.message);

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "shift_summary_generated",
    entityType: "shift_summary",
    entityId: due.shiftKey,
    actorLabel: "নির্ধারিত সময়সূচি",
    metadata: { ...totals, agents: lines.length },
  });

  return { generated: true as const, shiftKey: due.shiftKey, totals, agents: lines.length };
}

/**
 * On the 5th of each month, HQ's rolling month is cleared: the rows stay in the
 * IT Console for ever, they just stop showing in Executive HQ.
 */
export async function purgeHqSummaries(at: Date = new Date()) {
  const { day } = dhakaParts(at);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(at.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("shift_summaries")
    .update({ hq_visible: false })
    .eq("hq_visible", true)
    .lt("window_start", day === 5 ? at.toISOString() : cutoff)
    .select("id");
  if (error) throw new Error(error.message);

  const cleared = (data ?? []).length;
  if (cleared) {
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "shift_summary_hq_cleared",
      entityType: "shift_summary",
      entityId: null,
      actorLabel: "নির্ধারিত সময়সূচি",
      metadata: { cleared, monthlyReset: day === 5 },
    });
  }
  return { cleared, monthlyReset: day === 5 };
}

/** hq scope = the rolling month shown in Executive HQ; it scope = everything. */
export async function listShiftSummaries(scope: "hq" | "it", limit = 60) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("shift_summaries")
    .select("*")
    .order("window_start", { ascending: false })
    .limit(limit);
  if (scope === "hq") query = query.eq("hq_visible", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ShiftSummaryRow[];
}
