/**
 * Durable transcription + AI analysis queue.
 *
 * Recording rows carry their own state machine so nothing is ever lost:
 *   pending -> processing -> completed | failed | not_available
 *
 * `analysis_attempts` + `analysis_error` make retries visible; the sweep is
 * idempotent and safe to call from the upload route, the IT Console and cron.
 */
const MAX_ATTEMPTS = 5;

export type AnalysisState = "pending" | "processing" | "completed" | "failed" | "not_available";

export async function analyzePending(limit = 3) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: rows } = await supabaseAdmin
    .from("call_recordings")
    .select("id, analysis_status, analysis_attempts, lead_id, agent_id")
    .in("analysis_status", ["pending", "failed"])
    .lt("analysis_attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(limit);

  const results: { id: string; status: AnalysisState }[] = [];
  for (const row of rows ?? []) {
    results.push({ id: row.id, status: await analyzeOne(row.id) });
  }
  return results;
}

export async function analyzeOne(recordingId: string): Promise<AnalysisState> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processRecording } = await import("@/lib/call-intel.server");
  const { logLeadEvent } = await import("@/lib/lead-events.server");
  const { upsertCallJob } = await import("@/lib/call-jobs.server");

  const { data: row } = await supabaseAdmin
    .from("call_recordings")
    .select("id, lead_id, agent_id, analysis_attempts, audio_url, analysis_status")
    .eq("id", recordingId)
    .maybeSingle();
  if (!row) return "failed";
  if (row.analysis_status === "completed") return "completed";

  if (!row.audio_url) {
    await supabaseAdmin
      .from("call_recordings")
      .update({
        analysis_status: "not_available",
        analysis_error: "no audio file",
        recording_status: "not_available",
      })
      .eq("id", recordingId);
    await upsertCallJob({
      recordingId,
      jobType: "transcription",
      status: "failed",
      errorMessage: "no audio file",
    });
    return "not_available";
  }

  const attempts = (row.analysis_attempts ?? 0) + 1;
  await supabaseAdmin
    .from("call_recordings")
    .update({ analysis_status: "processing", analysis_attempts: attempts })
    .eq("id", recordingId);
  await upsertCallJob({
    recordingId,
    jobType: "transcription",
    status: "processing",
    countAttempt: true,
  });

  try {
    const outcome = await processRecording(recordingId);
    if (outcome === "empty") {
      await supabaseAdmin
        .from("call_recordings")
        .update({
          analysis_status: attempts >= MAX_ATTEMPTS ? "not_available" : "failed",
          analysis_error: "transcript was empty (no speech detected)",
        })
        .eq("id", recordingId);
      return attempts >= MAX_ATTEMPTS ? "not_available" : "failed";
    }

    await supabaseAdmin
      .from("call_recordings")
      .update({ analysis_status: "completed", analysis_error: null })
      .eq("id", recordingId);
    await upsertCallJob({ recordingId, jobType: "transcription", status: "completed" });
    await upsertCallJob({ recordingId, jobType: "ai_analysis", status: "completed" });
    await logLeadEvent({
      leadId: row.lead_id,
      agentId: row.agent_id,
      recordingId,
      kind: "transcript_ready",
      detail: "ট্রান্সক্রিপ্ট ও এআই বিশ্লেষণ তৈরি",
    });
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "analysis failed";
    await supabaseAdmin
      .from("call_recordings")
      .update({
        analysis_status: attempts >= MAX_ATTEMPTS ? "not_available" : "failed",
        analysis_error: message.slice(0, 500),
      })
      .eq("id", recordingId);
    await upsertCallJob({
      recordingId,
      jobType: "transcription",
      status: "failed",
      errorMessage: message,
    });
    await logLeadEvent({
      leadId: row.lead_id,
      agentId: row.agent_id,
      recordingId,
      kind: "transcript_failed",
      detail: `এআই বিশ্লেষণ ব্যর্থ (চেষ্টা ${attempts}) — আবার চেষ্টা হবে`,
    });
    return attempts >= MAX_ATTEMPTS ? "not_available" : "failed";
  }
}
