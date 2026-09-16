import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maskWhen } from "@/lib/pii";

/**
 * Recording pipeline observability for the IT Console.
 *
 * Every stage shown here is derived from real rows: call_recordings,
 * recording_drive_backups, call_reports and leads. Nothing is simulated — a
 * stage with no row is reported as "pending", never as success.
 */

export type StageState = "success" | "verified" | "processing" | "pending" | "failed" | "skipped";

export type PipelineStage = {
  key: string;
  label: string;
  state: StageState;
  at: string | null;
  detail: string | null;
};

export type PipelineRow = {
  recordingId: string;
  leadId: string | null;
  leadName: string | null;
  agentId: string | null;
  agentName: string | null;
  phone: string;
  durationSeconds: number;
  startedAt: string | null;
  createdAt: string;
  stages: PipelineStage[];
  /** Coarse roll-up used for filtering and the badge column. */
  overall: "completed" | "processing" | "retry" | "failed" | "pending";
  attempts: number;
  error: string | null;
};

const Input = z.object({ adminToken: z.string().nullable().optional() });

async function requireSupervisor(adminToken: string | null, write = false) {
  const { resolveCaller, requireDispatch, requireWrite } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  requireDispatch(caller);
  if (write) requireWrite(caller);
  return caller;
}

function stage(
  key: string,
  label: string,
  state: StageState,
  at: string | null,
  detail: string | null,
): PipelineStage {
  return { key, label, state, at, detail };
}

const PIPELINE_FILTERS = [
  "all",
  "failed",
  "pending",
  "retry",
  "completed",
  "drive_failed",
  "stt_failed",
  "ai_failed",
  "supabase_failed",
] as const;

export const recordingPipeline = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({
      filter: z.enum(PIPELINE_FILTERS).default("all"),
      days: z.number().int().min(1).max(30).default(7),
      limit: z.number().int().min(5).max(200).default(50),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const { data: recordings, error } = await supabaseAdmin
      .from("call_recordings")
      .select(
        "id, lead_id, agent_id, phone_number, duration_seconds, created_at, started_at, answered_at, finished_at, call_status, recording_status, upload_status, storage_path, sync_status, stt_status, stt_error_message, transcription_text, analysis_status, analysis_error, analysis_attempts, ai_summary, ai_lead_category, ai_temperature, ai_grade",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    const rows = recordings ?? [];
    const ids = rows.map((r) => r.id);
    const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];
    const agentIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))] as string[];

    const [backups, reports, leads, agents] = await Promise.all([
      ids.length
        ? supabaseAdmin
            .from("recording_drive_backups")
            .select(
              "call_recording_id, status, drive_file_id, drive_file_name, drive_file_url, error_message, updated_at",
            )
            .in("call_recording_id", ids)
        : Promise.resolve({ data: [] as never[] }),
      ids.length
        ? supabaseAdmin
            .from("call_reports")
            .select(
              "id, recording_id, lead_id, status, category, temperature, grade, submitted_at, updated_at",
            )
            .in("recording_id", ids)
        : Promise.resolve({ data: [] as never[] }),
      leadIds.length
        ? supabaseAdmin
            .from("leads")
            .select("id, name, work_state, temperature, grade")
            .in("id", leadIds)
        : Promise.resolve({ data: [] as never[] }),
      agentIds.length
        ? supabaseAdmin.from("profiles").select("id, name").in("id", agentIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    const backupBy = new Map((backups.data ?? []).map((b) => [b.call_recording_id, b]));
    const reportBy = new Map((reports.data ?? []).map((r) => [r.recording_id, r]));
    const leadBy = new Map((leads.data ?? []).map((l) => [l.id, l]));
    const agentBy = new Map((agents.data ?? []).map((a) => [a.id, a]));

    const built: PipelineRow[] = rows.map((r) => {
      const backup = backupBy.get(r.id) ?? null;
      const report = reportBy.get(r.id) ?? null;
      const lead = r.lead_id ? (leadBy.get(r.lead_id) ?? null) : null;

      // 1. Call lifecycle — from the timestamps the phone actually reported.
      const callState: StageState = r.finished_at
        ? "success"
        : r.answered_at || r.started_at
          ? "processing"
          : "pending";

      // 2/3. Recording capture and storage in the backend bucket.
      const recordingState: StageState =
        r.recording_status === "stored"
          ? "success"
          : r.recording_status === "not_available"
            ? "failed"
            : "pending";
      const supabaseState: StageState = r.storage_path
        ? "success"
        : r.recording_status === "not_available"
          ? "skipped"
          : "pending";

      // 4. Drive backup — verified only after a real Drive file check.
      const driveState: StageState =
        backup?.status === "verified"
          ? "verified"
          : backup?.status === "done"
            ? "success"
            : backup?.status === "failed"
              ? "failed"
              : r.storage_path
                ? "pending"
                : "skipped";

      // 5. Transcription.
      const sttState: StageState = r.transcription_text
        ? "success"
        : r.stt_status === "failed"
          ? "failed"
          : r.analysis_status === "processing"
            ? "processing"
            : r.storage_path
              ? "pending"
              : "skipped";

      // 6. AI analysis.
      const aiState: StageState =
        r.analysis_status === "completed" && r.ai_summary
          ? "success"
          : r.analysis_status === "failed"
            ? "failed"
            : r.analysis_status === "processing"
              ? "processing"
              : r.analysis_status === "not_available"
                ? "skipped"
                : "pending";

      // 7. CRM — the agent's own classification closes the loop, not the AI's.
      const crmState: StageState =
        report?.status === "submitted" && report.temperature && report.grade
          ? "success"
          : report
            ? "pending"
            : "pending";

      const stages: PipelineStage[] = [
        stage("call", "কল", callState, r.finished_at ?? r.started_at ?? null, r.call_status),
        stage(
          "recording",
          "রেকর্ডিং",
          recordingState,
          r.finished_at,
          `${r.duration_seconds ?? 0} সেকেন্ড`,
        ),
        stage(
          "supabase",
          "সার্ভার",
          supabaseState,
          r.created_at,
          r.storage_path ? "জমা হয়েছে" : null,
        ),
        stage(
          "drive",
          "Drive",
          driveState,
          backup?.updated_at ?? null,
          backup?.status === "failed" ? backup.error_message : (backup?.drive_file_name ?? null),
        ),
        stage("stt", "ট্রান্সক্রিপ্ট", sttState, r.created_at, r.stt_error_message),
        stage(
          "ai",
          "এআই সারসংক্ষেপ",
          aiState,
          r.created_at,
          r.analysis_error ?? r.ai_lead_category,
        ),
        stage(
          "crm",
          "শ্রেণিবিন্যাস",
          crmState,
          report?.submitted_at ?? null,
          report?.status === "submitted"
            ? `${report.temperature ?? "?"} / ${report.grade ?? "?"}`
            : lead?.work_state === "completed"
              ? "লিড সম্পন্ন"
              : "শ্রেণিবিন্যাস বাকি",
        ),
      ];

      const anyFailed = stages.some((s) => s.state === "failed");
      const attempts = r.analysis_attempts ?? 0;
      const allDone = stages.every((s) => ["success", "verified", "skipped"].includes(s.state));
      const overall: PipelineRow["overall"] = allDone
        ? "completed"
        : anyFailed
          ? attempts > 0 && attempts < 3
            ? "retry"
            : "failed"
          : stages.some((s) => s.state === "processing")
            ? "processing"
            : "pending";

      return {
        recordingId: r.id,
        leadId: r.lead_id,
        leadName: lead?.name ?? null,
        agentId: r.agent_id,
        agentName: r.agent_id ? (agentBy.get(r.agent_id)?.name ?? null) : null,
        phone: maskWhen(caller.maskPii, r.phone_number),
        durationSeconds: r.duration_seconds ?? 0,
        startedAt: r.started_at,
        createdAt: r.created_at,
        stages,
        overall,
        attempts,
        error: r.analysis_error ?? r.stt_error_message ?? backup?.error_message ?? null,
      };
    });

    const stateOf = (row: PipelineRow, key: string) =>
      row.stages.find((s) => s.key === key)?.state ?? "pending";

    const filtered = built.filter((row) => {
      switch (data.filter) {
        case "all":
          return true;
        case "failed":
          return row.overall === "failed";
        case "retry":
          return row.overall === "retry";
        case "pending":
          return row.overall === "pending" || row.overall === "processing";
        case "completed":
          return row.overall === "completed";
        case "drive_failed":
          return stateOf(row, "drive") === "failed";
        case "stt_failed":
          return stateOf(row, "stt") === "failed";
        case "ai_failed":
          return stateOf(row, "ai") === "failed";
        case "supabase_failed":
          return stateOf(row, "recording") === "failed" || stateOf(row, "supabase") === "failed";
      }
    });

    return {
      rows: filtered,
      totals: {
        scanned: built.length,
        completed: built.filter((r) => r.overall === "completed").length,
        processing: built.filter((r) => r.overall === "processing").length,
        pending: built.filter((r) => r.overall === "pending").length,
        retry: built.filter((r) => r.overall === "retry").length,
        failed: built.filter((r) => r.overall === "failed").length,
      },
    };
  });

/**
 * Retry one stuck recording. Every step is idempotent:
 *  - Drive upload no-ops when a successful backup row already exists.
 *  - Transcription/AI returns "completed" without re-billing a finished row.
 */
export const retryPipelineItem = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({
      recordingId: z.string().uuid(),
      step: z.enum(["drive", "analysis"]),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const caller = await requireSupervisor(data.adminToken ?? null, true);
    const { logAudit } = await import("@/lib/audit.server");

    const audit = async (outcome: string, detail: string | null) => {
      await logAudit({
        action: "pipeline_retry",
        entityType: "call_recording",
        entityId: data.recordingId,
        actorProfileId: caller.profile?.id ?? null,
        actorLabel: caller.profile?.name ?? "Authority PIN",
        metadata: { step: data.step, outcome, detail },
      });
    };

    try {
      if (data.step === "drive") {
        const { backupRecordingToDrive } = await import("@/lib/recording-drive.server");
        const result = await backupRecordingToDrive(data.recordingId);
        await audit(result.status, result.driveFileId ?? null);
        return { ok: true as const, outcome: result.status, detail: result.driveFileId ?? null };
      }
      const { analyzeOne } = await import("@/lib/analysis-queue.server");
      const outcome = await analyzeOne(data.recordingId);
      await audit(String(outcome), null);
      return { ok: true as const, outcome: String(outcome), detail: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failed retry is recorded on the backup row so the queue keeps the
      // real reason instead of silently dropping it.
      if (data.step === "drive") {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("recording_drive_backups").upsert(
          {
            call_recording_id: data.recordingId,
            status: "failed",
            error_message: message.slice(0, 500),
          },
          { onConflict: "call_recording_id" },
        );
      }
      await audit("failed", message.slice(0, 300));
      return { ok: false as const, outcome: "failed", detail: message };
    }
  });

/**
 * Checks the actual Drive file behind a stored drive_file_id. A database flag
 * alone is never treated as proof: a missing or trashed file flips the row to
 * DRIVE_VERIFICATION_FAILED.
 */
export const verifyDriveBackups = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({ limit: z.number().int().min(1).max(100).default(25) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { driveFileMeta } = await import("@/lib/gdrive.server");

    const { data: backups, error } = await supabaseAdmin
      .from("recording_drive_backups")
      .select("id, call_recording_id, drive_file_id, drive_file_name, status")
      .in("status", ["done", "verified"])
      .not("drive_file_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);

    let verified = 0;
    let missing = 0;
    const failures: { recordingId: string; fileName: string | null }[] = [];

    for (const row of backups ?? []) {
      const meta = row.drive_file_id ? await driveFileMeta(row.drive_file_id) : null;
      const ok = Boolean(meta && !meta.trashed);
      if (ok) verified += 1;
      else {
        missing += 1;
        failures.push({
          recordingId: row.call_recording_id ?? row.id,
          fileName: row.drive_file_name,
        });
      }
      await supabaseAdmin
        .from("recording_drive_backups")
        .update({
          status: ok ? "verified" : "failed",
          error_message: ok ? null : "DRIVE_VERIFICATION_FAILED — Drive-এ ফাইল পাওয়া যায়নি",
        })
        .eq("id", row.id);
    }

    // The shift summary doc is verified the same way — file id, not flag.
    const { data: docs } = await supabaseAdmin
      .from("recording_doc_backups")
      .select("id, date_key, drive_file_id, status")
      .eq("status", "done")
      .not("drive_file_id", "is", null)
      .order("updated_at", { ascending: false })
      .limit(10);

    let docsVerified = 0;
    let docsMissing = 0;
    for (const doc of docs ?? []) {
      const meta = doc.drive_file_id ? await driveFileMeta(doc.drive_file_id) : null;
      const ok = Boolean(meta && !meta.trashed);
      if (ok) docsVerified += 1;
      else docsMissing += 1;
      await supabaseAdmin
        .from("recording_doc_backups")
        .update({
          status: ok ? "verified" : "failed",
          error_message: ok ? null : "DRIVE_VERIFICATION_FAILED",
        })
        .eq("id", doc.id);
    }

    return {
      checked: backups?.length ?? 0,
      verified,
      missing,
      failures,
      docsVerified,
      docsMissing,
    };
  });
