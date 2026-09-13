/**
 * End-to-end check of the review alerts against the real database, using
 * throwaway rows that are deleted again. Skipped when no service credentials
 * are present (e.g. a plain CI checkout).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasService = Boolean(process.env["SUPABASE_URL"] && process.env["SUPABASE_SERVICE_ROLE_KEY"]);

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

let admin: Admin;
let agentId: string | null = null;
let leadId: string | null = null;
let recordingId: string | null = null;
const reportIds: string[] = [];
const alertIds: string[] = [];

const CLEAN_MARK = "audit-probe-2026-09-13";

async function makeReport(input: { recordingId: string | null; duration: number }) {
  const { data, error } = await admin
    .from("call_reports")
    .insert({
      lead_id: leadId!,
      // Left unset on purpose: a live agent may legitimately have a pending
      // report, and `call_reports_one_pending_per_agent` (correctly) forbids a
      // second one. The probe must not disturb real work.
      agent_id: null,
      recording_id: input.recordingId,
      call_ended_at: new Date().toISOString(),
      duration_seconds: input.duration,
      connected: true,
      status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  reportIds.push(data.id);
  return data.id as string;
}

describe.runIf(hasService)("review alerts (live database)", () => {
  beforeAll(async () => {
    ({ supabaseAdmin: admin } = await import("@/integrations/supabase/client.server"));
    const { data: agent } = await admin.from("profiles").select("id").limit(1).maybeSingle();
    agentId = agent?.id ?? null;
    const { data: lead, error } = await admin
      .from("leads")
      .insert({ name: `${CLEAN_MARK}-lead`, phone_number: "01799000001", source: "manual" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    leadId = lead.id;

    const { data: recording, error: recErr } = await admin
      .from("call_recordings")
      .insert({
        lead_id: leadId,
        agent_id: agentId,
        phone_number: "01799000001",
        call_direction: "outgoing",
        duration_seconds: 120,
        ai_temperature: "hot",
        ai_grade: "A",
      })
      .select("id")
      .single();
    if (recErr) throw new Error(recErr.message);
    recordingId = recording.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (alertIds.length) await admin.from("system_alerts").delete().in("id", alertIds);
    if (reportIds.length) await admin.from("call_reports").delete().in("id", reportIds);
    if (recordingId) await admin.from("call_recordings").delete().eq("id", recordingId);
    if (leadId) {
      await admin.from("audit_logs").delete().in("entity_id", reportIds);
      await admin.from("leads").delete().eq("id", leadId);
    }
  });

  it("raises one immutable alert when the agent disagrees with the AI, and never duplicates it", async () => {
    const { reviewSubmittedReport } = await import("@/lib/classification-review.server");
    const reportId = await makeReport({ recordingId, duration: 120 });

    const first = await reviewSubmittedReport({
      reportId,
      leadId: leadId!,
      agentId: agentId!,
      recordingId,
      connected: true,
      durationSeconds: 120,
      temperature: "cold",
      grade: "D",
    });
    expect(first.mismatchAlertId).toBeTruthy();
    alertIds.push(first.mismatchAlertId!);

    const again = await reviewSubmittedReport({
      reportId,
      leadId: leadId!,
      agentId: agentId!,
      recordingId,
      connected: true,
      durationSeconds: 120,
      temperature: "cold",
      grade: "D",
    });
    expect(again.mismatchAlertId).toBe(first.mismatchAlertId);

    const { data: alert } = await admin
      .from("system_alerts")
      .select("code, severity, detail, acknowledged_at")
      .eq("id", first.mismatchAlertId!)
      .single();
    expect(alert?.code).toBe("ai_agent_classification_mismatch");
    expect(alert?.severity).toBe("critical");
    expect(alert?.acknowledged_at).toBeNull();

    const { data: audit } = await admin
      .from("audit_logs")
      .select("action")
      .eq("entity_id", reportId)
      .eq("action", "ai_agent_mismatch_flagged");
    expect((audit ?? []).length).toBe(1);
  });

  it("stays silent when the agent agrees with the AI", async () => {
    const { reviewSubmittedReport } = await import("@/lib/classification-review.server");
    const reportId = await makeReport({ recordingId, duration: 120 });
    const result = await reviewSubmittedReport({
      reportId,
      leadId: leadId!,
      agentId: agentId!,
      recordingId,
      connected: true,
      durationSeconds: 120,
      temperature: "hot",
      grade: "A",
    });
    expect(result.mismatchAlertId).toBeNull();
    expect(result.missingRecordingAlertId).toBeNull();
  });

  it("raises a pending action when a received call has no recording", async () => {
    const { reviewSubmittedReport } = await import("@/lib/classification-review.server");
    const reportId = await makeReport({ recordingId: null, duration: 95 });
    const result = await reviewSubmittedReport({
      reportId,
      leadId: leadId!,
      agentId: agentId!,
      recordingId: null,
      connected: true,
      durationSeconds: 95,
      temperature: "warm",
      grade: "B",
    });
    expect(result.missingRecordingAlertId).toBeTruthy();
    alertIds.push(result.missingRecordingAlertId!);
  });

  it("does not nag about a very short unanswered call", async () => {
    const { reviewSubmittedReport } = await import("@/lib/classification-review.server");
    const reportId = await makeReport({ recordingId: null, duration: 4 });
    const result = await reviewSubmittedReport({
      reportId,
      leadId: leadId!,
      agentId: agentId!,
      recordingId: null,
      connected: false,
      durationSeconds: 4,
      temperature: null,
      grade: null,
    });
    expect(result.missingRecordingAlertId).toBeNull();
  });
});
