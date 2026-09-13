import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Web-side entry points for the mandatory post-call workflow and the follow-up
 * calendar. Both the web desk and the Android app go through the same server
 * helpers in call-reports.server.ts, so the invariant is identical everywhere.
 */

const Base = z.object({ adminToken: z.string().nullable().optional() });

async function agentOf(adminToken: string | null) {
  const { resolveCaller } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  if (caller.scope === "none" || !caller.profile) {
    throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
  }
  return caller.profile;
}

/** The agent's open post-call report, with the AI suggestion when ready. */
export const myPendingReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Base.parse(input))
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { loadPendingReportDetail } = await import("@/lib/call-reports.server");
    return loadPendingReportDetail(me.id);
  });

/** Gate before dialling: refuses while a report is unfinished. */
export const startMyCall = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Base.extend({ leadId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { pendingReportFor } = await import("@/lib/call-reports.server");
    const pending = await pendingReportFor(me.id);
    if (pending) {
      return {
        blocked: true as const,
        reportId: pending.id,
        reason: "আগের কলের রিপোর্ট জমা দিন, তারপর নতুন কল শুরু করা যাবে",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone_number, assigned_to")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("লিড পাওয়া যায়নি");
    if (lead.assigned_to && lead.assigned_to !== me.id)
      throw new Error("এই লিড আপনার তালিকায় নেই");

    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: lead.id,
      agentId: me.id,
      kind: "call_started",
      detail: `${me.name} কল শুরু করেছেন`,
    });
    return { blocked: false as const, phone: lead.phone_number, name: lead.name };
  });

/** Call ended on the web desk -> open the durable report. */
export const openMyReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      leadId: z.string().uuid(),
      durationSeconds: z.number().int().min(0).default(0),
      connected: z.boolean().default(true),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { openCallReport } = await import("@/lib/call-reports.server");
    const report = await openCallReport({
      leadId: data.leadId,
      agentId: me.id,
      durationSeconds: data.durationSeconds,
      connected: data.connected,
    });
    return report;
  });

/**
 * Customer called the agent back. Logs the incoming call, claims the lead when
 * it is still unassigned, and opens the mandatory post-call report — the same
 * gate as an outgoing call, so callbacks get category/summary/note/follow-up
 * and land in the spreadsheet like every other report.
 */
export const logIncomingCallback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      leadId: z.string().uuid(),
      durationSeconds: z.number().int().min(0).max(86400).default(0),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone_number, assigned_to")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("লিড পাওয়া যায়নি");
    if (lead.assigned_to && lead.assigned_to !== me.id) {
      throw new Error("এই লিড আপনার তালিকায় নেই");
    }
    if (!lead.assigned_to) {
      await supabaseAdmin
        .from("leads")
        .update({
          assigned_to: me.id,
          assigned_agent_id: me.id,
          assignment_source: "callback_claim",
        })
        .eq("id", lead.id);
    }

    const { data: rec, error } = await supabaseAdmin
      .from("call_recordings")
      .insert({
        lead_id: lead.id,
        agent_id: me.id,
        phone_number: lead.phone_number,
        call_direction: "incoming_callback",
        duration_seconds: data.durationSeconds,
        is_two_sided: false,
        sync_status: "uploaded",
        analysis_status: "not_available",
        call_source: "web_callback",
        call_status: "completed",
        recording_status: "not_available",
        upload_status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { openCallReport } = await import("@/lib/call-reports.server");
    const report = await openCallReport({
      leadId: lead.id,
      agentId: me.id,
      recordingId: rec?.id ?? null,
      phoneNumber: lead.phone_number,
      durationSeconds: data.durationSeconds,
      connected: true,
    });

    await supabaseAdmin
      .from("leads")
      .update({ last_call_at: new Date().toISOString() })
      .eq("id", lead.id);

    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: lead.id,
      agentId: me.id,
      kind: "call_connected",
      detail: "ক্রেতা ফিরতি কল করেছেন (কলব্যাক)",
    });

    return report;
  });

export const submitMyReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      reportId: z.string().uuid(),
      category: z.string().min(2).max(40),
      summary: z.string().trim().max(4000).nullable().optional(),
      note: z.string().trim().max(4000).nullable().optional(),
      reason: z.string().trim().max(2000).nullable().optional(),
      followUpAt: z.string().nullable().optional(),
      reminderMinutes: z.number().int().min(0).max(1440).default(15),
      temperature: z.enum(["hot", "warm", "cold"]).nullable().optional(),
      grade: z.enum(["A", "B", "C", "D"]).nullable().optional(),
      aiDecision: z.enum(["accepted", "edited", "rejected"]).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { submitCallReport } = await import("@/lib/call-reports.server");
    return submitCallReport({
      reportId: data.reportId,
      agentId: me.id,
      category: data.category,
      summary: data.summary ?? null,
      note: data.note ?? null,
      reason: data.reason ?? null,
      followUpAt: data.followUpAt ? new Date(data.followUpAt).toISOString() : null,
      reminderMinutes: data.reminderMinutes,
      temperature: data.temperature ?? null,
      grade: data.grade ?? null,
      aiDecision: data.aiDecision ?? null,
    });
  });

/** Calendar + notification feed. Agents see their own, supervisors see the floor. */
export const myFollowUps = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      fromIso: z.string().nullable().optional(),
      toIso: z.string().nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("follow_up_events")
      .select("*")
      .order("scheduled_at", { ascending: true })
      .limit(500);

    if (caller.scope === "agent" && caller.profile) query = query.eq("agent_id", caller.profile.id);
    if (data.fromIso) query = query.gte("scheduled_at", data.fromIso);
    if (data.toIso) query = query.lte("scheduled_at", data.toIso);

    const { data: events, error } = await query;
    if (error) throw new Error(error.message);

    const now = Date.now();
    return (events ?? []).map((event) => {
      const at = new Date(event.scheduled_at).getTime();
      const due = at - (event.reminder_minutes ?? 15) * 60_000;
      const state =
        event.status === "done" ? "done" : at < now ? "overdue" : due <= now ? "due" : "upcoming";
      return { ...event, state } as typeof event & {
        state: "done" | "overdue" | "due" | "upcoming";
      };
    });
  });

export const completeFollowUp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Base.extend({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("follow_up_events")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", data.eventId)
      .eq("agent_id", me.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** The agent's own submitted call reports plus the next upcoming follow-ups. */
export const myCallReports = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({ limit: z.number().int().min(1).max(100).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reports } = await supabaseAdmin
      .from("call_reports")
      .select(
        "id, lead_id, status, category, summary, note, reason, follow_up_at, connected, duration_seconds, call_ended_at, submitted_at, recording_id, temperature, grade",
      )
      .eq("agent_id", me.id)
      .order("call_ended_at", { ascending: false })
      .limit(data.limit ?? 50);

    const leadIds = [...new Set((reports ?? []).map((r) => r.lead_id).filter(Boolean))] as string[];
    const { data: leads } = leadIds.length
      ? await supabaseAdmin
          .from("leads")
          .select("id, name, phone_number, company")
          .in("id", leadIds)
      : { data: [] };
    const leadById = new Map((leads ?? []).map((l) => [l.id, l]));

    const nowIso = new Date().toISOString();
    const { data: upcoming } = await supabaseAdmin
      .from("follow_up_events")
      .select(
        "id, lead_id, customer_name, phone_number, category, priority, note, scheduled_at, status",
      )
      .eq("agent_id", me.id)
      .neq("status", "done")
      .order("scheduled_at", { ascending: true })
      .limit(20);

    return {
      reports: (reports ?? []).map((r) => ({ ...r, lead: leadById.get(r.lead_id ?? "") ?? null })),
      upcoming: upcoming ?? [],
      overdueCount: (upcoming ?? []).filter((e) => e.scheduled_at < nowIso).length,
    };
  });

/** Field correction on an already submitted update, inside the 09:00–12:45 window. */
export const editMyReport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      reportId: z.string().uuid(),
      category: z.string().min(2).max(40),
      summary: z.string().trim().max(4000).nullable().optional(),
      note: z.string().trim().max(4000).nullable().optional(),
      reason: z.string().trim().max(2000).nullable().optional(),
      followUpAt: z.string().nullable().optional(),
      temperature: z.enum(["hot", "warm", "cold"]).nullable().optional(),
      grade: z.enum(["A", "B", "C", "D"]).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await agentOf(data.adminToken ?? null);
    const { editSubmittedReport } = await import("@/lib/call-reports.server");
    return editSubmittedReport({
      reportId: data.reportId,
      agentId: me.id,
      category: data.category,
      summary: data.summary ?? null,
      note: data.note ?? null,
      reason: data.reason ?? null,
      followUpAt: data.followUpAt ? new Date(data.followUpAt).toISOString() : null,
      temperature: data.temperature ?? null,
      grade: data.grade ?? null,
    });
  });
