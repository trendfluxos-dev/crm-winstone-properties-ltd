/**
 * Retry-safe processing jobs + offline sync events.
 *
 * Every recording that reaches the CRM gets one job row per stage
 * (recording_upload, transcription, ai_analysis). The rows are keyed by
 * (recording_id, job_type), so a WorkManager retry or a repeated sweep can
 * never create a duplicate job — it just updates the existing one.
 *
 * Provider names are recorded, never provider keys: secrets stay in the server
 * environment and are never written to the database.
 */
export type CallJobType = "recording_upload" | "transcription" | "ai_analysis";
export type CallJobStatus = "queued" | "processing" | "completed" | "failed";

/** Creates the job if missing, otherwise moves the existing one to `status`. */
export async function upsertCallJob(input: {
  recordingId: string;
  jobType: CallJobType;
  status: CallJobStatus;
  provider?: string | null;
  errorMessage?: string | null;
  countAttempt?: boolean;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from("call_processing_jobs")
    .select("id, attempts")
    .eq("recording_id", input.recordingId)
    .eq("job_type", input.jobType)
    .maybeSingle();

  const patch = {
    status: input.status,
    provider: input.provider ?? null,
    error_message: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
    started_at: input.status === "processing" ? now : undefined,
    completed_at: input.status === "completed" || input.status === "failed" ? now : null,
  };

  if (existing) {
    await supabaseAdmin
      .from("call_processing_jobs")
      .update({
        ...patch,
        attempts: input.countAttempt ? (existing.attempts ?? 0) + 1 : existing.attempts,
      })
      .eq("id", existing.id);
    return;
  }

  await supabaseAdmin.from("call_processing_jobs").insert({
    recording_id: input.recordingId,
    job_type: input.jobType,
    ...patch,
    attempts: input.countAttempt ? 1 : 0,
  });
}

/** Queues the three stages for a freshly stored recording. */
export async function queueCallJobs(recordingId: string, hasAudio: boolean): Promise<void> {
  await upsertCallJob({
    recordingId,
    jobType: "recording_upload",
    status: hasAudio ? "completed" : "failed",
    errorMessage: hasAudio ? null : "device could not record this call",
  });
  if (!hasAudio) return;
  await upsertCallJob({ recordingId, jobType: "transcription", status: "queued" });
  await upsertCallJob({ recordingId, jobType: "ai_analysis", status: "queued" });
}

/**
 * Records an event the phone pushed (or will push) while offline. The
 * idempotency key makes replays harmless.
 */
export async function recordSyncEvent(input: {
  agentId?: string | null;
  deviceId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  idempotencyKey?: string | null;
  status?: "queued" | "processed" | "failed";
  errorMessage?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const status = input.status ?? "processed";

  const { error } = await supabaseAdmin.from("sync_events").insert({
    agent_id: input.agentId ?? null,
    device_id: input.deviceId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    payload: (input.payload ?? {}) as never,
    status,
    error_message: input.errorMessage ? input.errorMessage.slice(0, 500) : null,
    processed_at: status === "queued" ? null : new Date().toISOString(),
  });

  // A duplicate key means the same phone event already landed — that is a
  // success for an offline-first client, not an error.
  if (error && !`${error.message}`.toLowerCase().includes("duplicate")) {
    console.error("[sync_events] insert failed", error.message);
  }
}
