/**
 * Raises the immutable review alerts that follow a submitted call report:
 *   - AI vs agent classification disagreement (agent decision untouched)
 *   - a received call with no recording linked (truthful pending action)
 *
 * Both are written once per report (idempotent on the report id) and are only
 * ever closed by an explicit acknowledge from IT / Authority.
 */
import { classificationMismatch } from "@/lib/classification-review";

async function alertOnce(input: {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  action: string;
  reportId: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const marker = `report:${input.reportId}`;
  const { data: existing } = await supabaseAdmin
    .from("system_alerts")
    .select("id")
    .eq("code", input.code)
    .like("detail", `%${marker}%`)
    .limit(1);
  if (existing && existing.length > 0) return { raised: false as const, alertId: existing[0]!.id };

  const { data, error } = await supabaseAdmin
    .from("system_alerts")
    .insert({
      code: input.code,
      severity: input.severity,
      title: input.title,
      detail: `${input.detail} — ${marker}`,
      action: input.action,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[classification-review] alert insert failed", error);
    return { raised: false as const, alertId: null };
  }
  return { raised: true as const, alertId: data.id };
}

/**
 * Compares the AI opinion stored on the linked recording with the agent's final
 * classification. Never writes to the report or the lead.
 */
export async function reviewSubmittedReport(input: {
  reportId: string;
  leadId: string;
  agentId: string;
  recordingId: string | null;
  connected: boolean;
  durationSeconds: number;
  temperature: string | null;
  grade: string | null;
}): Promise<{ mismatchAlertId: string | null; missingRecordingAlertId: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let mismatchAlertId: string | null = null;
  let missingRecordingAlertId: string | null = null;

  if (input.recordingId) {
    const { data: recording } = await supabaseAdmin
      .from("call_recordings")
      .select("id, ai_temperature, ai_grade, recording_status, upload_status")
      .eq("id", input.recordingId)
      .maybeSingle();

    const mismatch = classificationMismatch({
      aiTemperature: recording?.ai_temperature ?? null,
      aiGrade: recording?.ai_grade ?? null,
      humanTemperature: input.temperature,
      humanGrade: input.grade,
    });

    if (mismatch) {
      const raised = await alertOnce({
        code: "ai_agent_classification_mismatch",
        severity: mismatch.severity,
        title: mismatch.title,
        detail: `${mismatch.detail} · lead:${input.leadId} · agent:${input.agentId}`,
        action: "IT Console → রেকর্ডিং শুনে শ্রেণিবিন্যাস পুনর্বিবেচনা",
        reportId: input.reportId,
      });
      mismatchAlertId = raised.alertId;
      if (raised.raised) {
        const { logAudit } = await import("@/lib/audit.server");
        await logAudit({
          action: "ai_agent_mismatch_flagged",
          entityType: "call_report",
          entityId: input.reportId,
          actorProfileId: input.agentId,
          metadata: {
            leadId: input.leadId,
            recordingId: input.recordingId,
            fields: mismatch.fields,
            distance: mismatch.distance,
            ai: { temperature: recording?.ai_temperature ?? null, grade: recording?.ai_grade ?? null },
            agent: { temperature: input.temperature, grade: input.grade },
          },
        });
      }
    }
    return { mismatchAlertId, missingRecordingAlertId };
  }

  // A real conversation with no recording attached is a pending action, not a
  // silent success. Very short calls are ignored to avoid noise.
  if (input.connected && input.durationSeconds >= 20) {
    const raised = await alertOnce({
      code: "recording_missing_for_report",
      severity: "warning",
      title: "কথা হওয়া কলের রেকর্ডিং পাওয়া যায়নি",
      detail: `lead:${input.leadId} · agent:${input.agentId} · ${input.durationSeconds}s`,
      action: "IT Console → ফোনের রেকর্ডার যাচাই / এজেন্ট আপলোড",
      reportId: input.reportId,
    });
    missingRecordingAlertId = raised.alertId;
  }

  return { mismatchAlertId, missingRecordingAlertId };
}
