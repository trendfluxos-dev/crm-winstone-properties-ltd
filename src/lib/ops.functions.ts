import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { maskForCaller } from "@/lib/pii";

/**
 * Supervisor read-outs: post-call report health, recording/AI pipeline state,
 * follow-up pressure and the assignment audit trail. Everything here is
 * supervisor-scoped (Executive HQ / IT Console).
 */
const Input = z.object({ adminToken: z.string().nullable().optional() });

async function requireSupervisor(adminToken: string | null, write = false) {
  const { resolveCaller, requireDispatch, requireWrite } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  requireDispatch(caller);
  // HQ sessions may read every board here but never change system state.
  if (write) requireWrite(caller);
  return caller;
}

export const callOpsSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const caller = await requireSupervisor(data.adminToken ?? null);
    const maskCtx = {
      maskPii: caller.maskPii,
      leadModerator: caller.leadModerator,
      selfId: caller.profile?.id ?? null,
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [reports, recordings, followUps, devices, alerts, leads, jobs, syncEvents, agentRows] =
      await Promise.all([
        supabaseAdmin
          .from("call_reports")
          .select("id, agent_id, status, category, created_at, submitted_at")
          .gte("created_at", since),
        supabaseAdmin
          .from("call_recordings")
          .select("id, analysis_status, analysis_error, recorder_source, is_two_sided, created_at")
          .gte("created_at", since),
        supabaseAdmin
          .from("follow_up_events")
          .select("id, agent_id, status, scheduled_at, reminder_minutes"),
        supabaseAdmin
          .from("agent_devices")
          .select(
            "id, profile_id, device_label, app_version, phone_number, last_seen_at, revoked_at, model, manufacturer, android_version, recording_mode, recording_capable, recording_tested, recording_note, recording_checked_at",
          ),
        supabaseAdmin
          .from("system_alerts")
          .select("*")
          .is("acknowledged_at", null)
          .order("created_at", { ascending: false })
          .limit(20),
        supabaseAdmin.from("leads").select("id, assigned_to, status"),
        supabaseAdmin
          .from("call_processing_jobs")
          .select("id, job_type, status, attempts, error_message")
          .gte("created_at", since),
        supabaseAdmin
          .from("sync_events")
          .select("id, event_type, status, created_at")
          .gte("created_at", since),
        supabaseAdmin.from("profiles").select("id, name, sim_number, sim_bound_at"),
      ]);

    const simKeyOf = (value: string | null) => {
      const digits = (value ?? "").replace(/\D+/g, "");
      return digits.length >= 10 ? digits.slice(-10) : null;
    };
    const agentById = new Map((agentRows.data ?? []).map((a) => [a.id, a]));

    const count = <T>(rows: T[] | null, predicate: (row: T) => boolean) =>
      (rows ?? []).filter(predicate).length;

    const now = Date.now();
    const categories: Record<string, number> = {};
    for (const row of reports.data ?? []) {
      if (row.status !== "submitted" || !row.category) continue;
      categories[row.category] = (categories[row.category] ?? 0) + 1;
    }

    return {
      reports: {
        pending: count(reports.data, (r) => r.status === "pending"),
        submitted: count(reports.data, (r) => r.status === "submitted"),
        categories,
      },
      analysis: {
        pending: count(recordings.data, (r) => r.analysis_status === "pending"),
        processing: count(recordings.data, (r) => r.analysis_status === "processing"),
        completed: count(recordings.data, (r) => r.analysis_status === "completed"),
        failed: count(recordings.data, (r) => r.analysis_status === "failed"),
        notAvailable: count(recordings.data, (r) => r.analysis_status === "not_available"),
        micOnly: count(recordings.data, (r) => r.is_two_sided === false),
        lastError:
          (recordings.data ?? []).find((r) => r.analysis_status === "failed")?.analysis_error ??
          null,
      },
      followUps: {
        overdue: count(
          followUps.data,
          (f) => f.status !== "done" && new Date(f.scheduled_at).getTime() < now,
        ),
        due: count(followUps.data, (f) => {
          if (f.status === "done") return false;
          const at = new Date(f.scheduled_at).getTime();
          return at >= now && at - (f.reminder_minutes ?? 30) * 60_000 <= now;
        }),
        upcoming: count(
          followUps.data,
          (f) => f.status !== "done" && new Date(f.scheduled_at).getTime() > now,
        ),
      },
      devices: (devices.data ?? []).map((d) => ({
        id: d.id,
        profileId: d.profile_id,
        label: d.device_label ?? d.model,
        model: d.model,
        manufacturer: d.manufacturer,
        androidVersion: d.android_version,
        appVersion: d.app_version,
        lastSeenAt: d.last_seen_at,
        revoked: Boolean(d.revoked_at),
        recordingMode: d.recording_mode,
        recordingCapable: d.recording_capable,
        recordingTested: d.recording_tested,
        recordingNote: d.recording_note,
        recordingCheckedAt: d.recording_checked_at,
        agentName: agentById.get(d.profile_id)?.name ?? null,
        agentSim: maskForCaller(
          maskCtx,
          d.profile_id,
          agentById.get(d.profile_id)?.sim_number ?? null,
        ),
        deviceSim: maskForCaller(maskCtx, d.profile_id, d.phone_number),
        simMatched:
          simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) !== null &&
          simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) === simKeyOf(d.phone_number),
      })),
      // Automatic SIM verification state, straight from what the phones report.
      sim: {
        verified: count(
          devices.data,
          (d) =>
            !d.revoked_at &&
            simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) !== null &&
            simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) === simKeyOf(d.phone_number),
        ),
        mismatched: count(
          devices.data,
          (d) =>
            !d.revoked_at &&
            simKeyOf(d.phone_number) !== null &&
            simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) !== null &&
            simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) !== simKeyOf(d.phone_number),
        ),
        missing: count(
          devices.data,
          (d) =>
            !d.revoked_at && simKeyOf(agentById.get(d.profile_id)?.sim_number ?? null) === null,
        ),
      },
      recording: {
        twoSided: count(devices.data, (d) => !d.revoked_at && d.recording_mode === "two_sided"),
        micOnly: count(devices.data, (d) => !d.revoked_at && d.recording_mode === "mic_only"),
        blocked: count(devices.data, (d) => !d.revoked_at && d.recording_mode === "unavailable"),
        untested: count(devices.data, (d) => !d.revoked_at && !d.recording_mode),
      },
      alerts: alerts.data ?? [],
      leads: {
        total: leads.data?.length ?? 0,
        unassigned: count(leads.data, (l) => l.assigned_to === null),
        pending: count(leads.data, (l) => l.status === "pending"),
      },
      pipeline: {
        queued: count(jobs.data, (j) => j.status === "queued"),
        processing: count(jobs.data, (j) => j.status === "processing"),
        completed: count(jobs.data, (j) => j.status === "completed"),
        failed: count(jobs.data, (j) => j.status === "failed"),
        retried: count(jobs.data, (j) => (j.attempts ?? 0) > 1),
        lastError: (jobs.data ?? []).find((j) => j.status === "failed")?.error_message ?? null,
      },
      sync: {
        total: syncEvents.data?.length ?? 0,
        queued: count(syncEvents.data, (s) => s.status === "queued"),
        failed: count(syncEvents.data, (s) => s.status === "failed"),
      },
    };
  });

/**
 * Revokes one bound phone. The device token stops working on the very next
 * request because `resolveApiCaller` requires `revoked_at IS NULL`. Idempotent:
 * revoking an already revoked device keeps the first timestamp.
 */
export const revokeAgentDevice = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.extend({ deviceId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const caller = await requireSupervisor(data.adminToken ?? null, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: device } = await supabaseAdmin
      .from("agent_devices")
      .select("id, profile_id, device_label, revoked_at")
      .eq("id", data.deviceId)
      .maybeSingle();
    if (!device) throw new Error("ফোনটি পাওয়া যায়নি");
    if (device.revoked_at) return { ok: true, alreadyRevoked: true };

    const { error } = await supabaseAdmin
      .from("agent_devices")
      .update({ revoked_at: new Date().toISOString(), status: "revoked" })
      .eq("id", device.id);
    if (error) throw new Error(error.message);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "device_revoked",
      entityType: "agent_device",
      entityId: device.id,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Authority PIN",
      metadata: { profile_id: device.profile_id, device_label: device.device_label },
    });
    return { ok: true, alreadyRevoked: false };
  });

/** Assign / reassign audit trail, newest first. */
export const assignmentHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({ limit: z.number().int().min(1).max(200).default(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("lead_assignments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Kicks the transcription / AI queue by hand from the IT Console. */
export const runAnalysisSweep = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null, true);
    const { analyzePending } = await import("@/lib/analysis-queue.server");
    const results = await analyzePending(10);
    return { processed: results.length, results };
  });

/** Acknowledges a persisted critical alert. */
export const acknowledgeAlert = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.extend({ alertId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const caller = await requireSupervisor(data.adminToken ?? null, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_alerts")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: caller.profile?.id ?? null,
      })
      .eq("id", data.alertId);
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "alert_acknowledged",
      entityType: "system_alert",
      entityId: data.alertId,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Authority PIN",
    });
    return { ok: true };
  });

/** Immutable audit history for the IT Console (newest first, paginated). */
export const auditTrail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    Input.extend({
      search: z.string().trim().max(120).optional(),
      action: z.string().trim().max(60).optional(),
      page: z.number().int().min(0).max(500).default(0),
      pageSize: z.number().int().min(5).max(100).default(25),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireSupervisor(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = data.page * data.pageSize;
    let query = supabaseAdmin
      .from("audit_logs")
      .select(
        "id, action, entity_type, entity_id, actor_label, actor_profile_id, metadata, created_at",
        {
          count: "exact",
        },
      )
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);

    if (data.action) query = query.eq("action", data.action);
    if (data.search) query = query.ilike("actor_label", `%${data.search}%`);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });
