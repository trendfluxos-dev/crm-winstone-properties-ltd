import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maskForCaller } from "@/lib/pii";

/**
 * Day-by-day lead work and the yearly retention record.
 *
 * A lead assigned to an agent never leaves that agent's dashboard. What changes
 * is only the working day it is listed under: the agent can pull an older lead
 * into today's work, or into a specific day, and every move is written to the
 * lead timeline so the IT council keeps the full history.
 */
const Base = z.object({ adminToken: z.string().nullable().optional() });

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "তারিখ ঠিক নয়");

async function callerOf(adminToken: string | null) {
  const { resolveCaller } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  if (caller.scope === "none" || !caller.profile) {
    throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
  }
  return caller;
}

/** Move a lead into a working day. The lead itself stays where it always was. */
export const setLeadWorkDate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({ leadId: z.string().uuid(), workDate: DATE }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await callerOf(data.adminToken ?? null);
    const me = caller.profile!;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { leadHeldByOther, LEAD_NOT_YOURS } = await import("@/lib/lead-access.server");

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, name, work_date, assigned_to, assigned_agent_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("লিড পাওয়া যায়নি");

    const coordinator = caller.scope !== "agent";
    if (!coordinator && leadHeldByOther(lead, me.id)) throw new Error(LEAD_NOT_YOURS);

    const { error } = await supabaseAdmin
      .from("leads")
      .update({ work_date: data.workDate })
      .eq("id", lead.id);
    if (error) throw new Error(error.message);

    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: lead.id,
      agentId: me.id,
      kind: "workday_moved",
      detail: `${me.name} লিডটি ${data.workDate} তারিখের কাজে এনেছেন${
        lead.work_date ? ` (আগে ${lead.work_date})` : ""
      }`,
    });

    return { ok: true as const, workDate: data.workDate };
  });

/** Everything one year holds, for the IT council's own storage. */
export const yearArchiveExport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({ year: z.number().int().min(2020).max(2100) }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await callerOf(data.adminToken ?? null);
    if (caller.scope === "agent") throw new Error("এই কাজটি শুধু আইটি কনসোলের");

    const from = `${data.year}-01-01T00:00:00Z`;
    const to = `${data.year + 1}-01-01T00:00:00Z`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [leads, reports, profiles] = await Promise.all([
      supabaseAdmin
        .from("leads")
        .select(
          "id, serial_no, name, phone_number, address, company, status, work_state, work_date, temperature, grade, call_attempts, last_call_at, assigned_to, created_at",
        )
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at"),
      supabaseAdmin
        .from("call_reports")
        .select(
          "id, lead_id, agent_id, status, category, connected, duration_seconds, temperature, grade, summary, note, reason, follow_up_at, submitted_at, created_at",
        )
        .gte("created_at", from)
        .lt("created_at", to)
        .order("created_at"),
      supabaseAdmin.from("profiles").select("id, name, employee_id"),
    ]);

    const names = new Map((profiles.data ?? []).map((p) => [p.id, p.name]));

    return {
      year: data.year,
      leads: (leads.data ?? []).map((lead) => ({
        ...lead,
        phone_number:
          maskForCaller(
            {
              maskPii: caller.maskPii,
              leadModerator: caller.leadModerator,
              selfId: caller.profile?.id ?? null,
            },
            lead.assigned_to,
            lead.phone_number,
          ) ?? "",
        agent_name: lead.assigned_to ? (names.get(lead.assigned_to) ?? "") : "",
      })),
      reports: (reports.data ?? []).map((report) => ({
        ...report,
        agent_name: report.agent_id ? (names.get(report.agent_id) ?? "") : "",
      })),
    };
  });

/** The archive record itself: where the year was stored, and by whom. */
export const recordYearArchive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Base.extend({
      year: z.number().int().min(2020).max(2100),
      storageLocation: z.string().trim().min(3, "কোথায় সংরক্ষণ করলেন লিখুন"),
      note: z.string().trim().max(500).optional(),
      leadCount: z.number().int().min(0),
      reportCount: z.number().int().min(0),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await callerOf(data.adminToken ?? null);
    if (caller.scope === "agent") throw new Error("এই কাজটি শুধু আইটি কনসোলের");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin.from("lead_year_archives").upsert(
      {
        archive_year: data.year,
        storage_location: data.storageLocation,
        note: data.note ?? null,
        lead_count: data.leadCount,
        report_count: data.reportCount,
        archived_by: caller.profile!.id,
        archived_at: new Date().toISOString(),
      },
      { onConflict: "archive_year" },
    );
    if (error) throw new Error(error.message);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorProfileId: caller.profile!.id,
      actorLabel: caller.profile!.name,
      action: "year_archive_recorded",
      entityType: "lead_year_archives",
      entityId: String(data.year),
      metadata: { leads: data.leadCount, reports: data.reportCount },
    });

    return { ok: true as const };
  });

/** Which years the council has already put into its own storage. */
export const listYearArchives = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Base.parse(input))
  .handler(async ({ data }) => {
    const caller = await callerOf(data.adminToken ?? null);
    if (caller.scope === "agent") throw new Error("এই কাজটি শুধু আইটি কনসোলের");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("lead_year_archives")
      .select("archive_year, lead_count, report_count, storage_location, note, archived_at")
      .order("archive_year", { ascending: false });
    return rows ?? [];
  });

/**
 * One day's calling performance for the signed-in agent, straight from the
 * reports they submitted.
 *
 * EVERY dialled call counts — including calls that lasted under three seconds
 * (wrong number, cut off, not picked up). Those are reported separately as
 * "very short", never dropped, because attempt count is part of the day's work.
 */
export const myDayPerformance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Base.extend({ day: DATE }).parse(input))
  .handler(async ({ data }) => {
    const caller = await callerOf(data.adminToken ?? null);
    const me = caller.profile!;
    // Dhaka day boundaries in UTC.
    const from = new Date(`${data.day}T00:00:00+06:00`).toISOString();
    const to = new Date(new Date(from).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("call_reports")
      .select("id, status, connected, duration_seconds, category, call_ended_at")
      .eq("agent_id", me.id)
      .gte("call_ended_at", from)
      .lt("call_ended_at", to);

    const reports = rows ?? [];
    const categories: Record<string, number> = {};
    let talkSeconds = 0;
    let connected = 0;
    let veryShort = 0;
    let pending = 0;

    for (const report of reports) {
      const seconds = report.duration_seconds ?? 0;
      talkSeconds += seconds;
      if (report.connected) connected += 1;
      if (seconds > 0 && seconds < 3) veryShort += 1;
      if (report.status === "pending") pending += 1;
      if (report.category) categories[report.category] = (categories[report.category] ?? 0) + 1;
    }

    return {
      day: data.day,
      calls: reports.length,
      connected,
      veryShort,
      pending,
      talkSeconds,
      categories,
    };
  });
