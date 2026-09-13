import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CommandAnswer, Surface } from "@/lib/command-agent.server";

/**
 * Command Agent server entry points, shared by all four surfaces.
 *
 * Ask = read-only, always role-scoped. Run = executes ONE whitelisted action
 * after re-checking the caller's role server-side, so a proposal card can never
 * grant permission the account does not already have.
 */

const OptionalToken = z.string().trim().max(200).optional().nullable();
const SurfaceSchema = z.enum(["desk", "dispatch", "hq", "system"]);

const AskInput = z.object({
  adminToken: OptionalToken,
  surface: SurfaceSchema,
  question: z.string().trim().min(3).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().max(2000),
      }),
    )
    .max(10)
    .default([]),
});

export const askCommandAgent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AskInput.parse(input))
  .handler(async ({ data }): Promise<CommandAnswer> => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("সাইন ইন করুন");

    const { runCommandAgent } = await import("@/lib/command-agent.server");
    return runCommandAgent(caller, data.surface as Surface, data.question, data.history);
  });

const Temperature = z.enum(["hot", "warm", "cold"]);
const Grade = z.enum(["A", "B", "C", "D"]);

const RunInput = z.object({
  adminToken: OptionalToken,
  surface: SurfaceSchema,
  action: z.object({
    type: z.enum([
      "assign_leads",
      "distribute_unassigned",
      "classify_lead",
      "retry_recording",
      "verify_drive",
      "generate_shift_summary",
      "acknowledge_alert",
      "retry_failed_recordings",
    ]),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  }),
});

function str(params: Record<string, string | number | null>, key: string): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function num(params: Record<string, string | number | null>, key: string, fallback: number): number {
  const value = params[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const runCommandAgentAction = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const { resolveCaller, requireAuthority, requireDispatch, requireWrite } = await import(
      "@/lib/access.server"
    );
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("সাইন ইন করুন");
    requireWrite(caller);

    const { allowedActions } = await import("@/lib/command-agent.server");
    const { type, params } = data.action;
    if (!allowedActions(caller).includes(type)) {
      throw new Error("এই কাজ করার অনুমতি এই অ্যাকাউন্টে নেই");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { logAudit } = await import("@/lib/audit.server");
    const actorProfileId = caller.profile?.id ?? null;
    const actorLabel = caller.profile?.name ?? "Authority PIN";

    const audit = async (outcome: string) => {
      await logAudit({
        action: "command_agent_action",
        entityType: "command_agent",
        entityId: null,
        actorProfileId,
        actorLabel,
        metadata: { type, params, surface: data.surface, outcome },
      });
    };

    if (type === "assign_leads") {
      requireDispatch(caller);
      const agentId = str(params, "agent_id");
      if (!agentId) throw new Error("কোন এজেন্টকে দেওয়া হবে তা বেছে নিন");
      const count = num(params, "count", 10);

      const { data: pool, error } = await supabaseAdmin
        .from("leads")
        .select("id, assigned_to")
        .eq("status", "pending")
        .is("assigned_to", null)
        .order("created_at")
        .limit(count);
      if (error) throw new Error(error.message);
      if (!pool?.length) {
        await audit("no_unassigned_leads");
        return { ok: false, message: "অ্যাসাইন করার মতো অমীমাংসিত লিড নেই" };
      }

      const ids = pool.map((l) => l.id);
      const { error: updateError } = await supabaseAdmin
        .from("leads")
        .update({ assigned_to: agentId, assignment_source: "command_agent" })
        .in("id", ids);
      if (updateError) throw new Error(updateError.message);

      await supabaseAdmin.from("lead_assignments").insert(
        pool.map((l) => ({
          lead_id: l.id,
          from_agent_id: l.assigned_to ?? null,
          to_agent_id: agentId,
          changed_by: actorProfileId,
          source: "command_agent",
        })),
      );
      await audit(`assigned:${ids.length}`);
      return { ok: true, message: `${ids.length}টি লিড অ্যাসাইন হয়েছে` };
    }

    if (type === "distribute_unassigned") {
      requireDispatch(caller);
      const [{ data: agents }, { data: leads }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("is_active", true)
          .eq("approval_status", "approved")
          .in("role", ["agent", "team_leader"])
          .order("name"),
        supabaseAdmin.from("leads").select("id").is("assigned_to", null).order("created_at"),
      ]);
      if (!agents?.length) throw new Error("সক্রিয় কোনো এজেন্ট নেই");
      if (!leads?.length) {
        await audit("nothing_to_distribute");
        return { ok: false, message: "অমীমাংসিত কোনো লিড নেই" };
      }

      await Promise.all(
        leads.map((lead, index) =>
          supabaseAdmin
            .from("leads")
            .update({
              assigned_to: agents[index % agents.length]!.id,
              assignment_source: "command_agent",
            })
            .eq("id", lead.id),
        ),
      );
      await supabaseAdmin.from("lead_assignments").insert(
        leads.map((lead, index) => ({
          lead_id: lead.id,
          to_agent_id: agents[index % agents.length]!.id,
          changed_by: actorProfileId,
          source: "command_agent",
        })),
      );
      await audit(`distributed:${leads.length}`);
      return {
        ok: true,
        message: `${leads.length}টি লিড ${agents.length} জন এজেন্টের মধ্যে ভাগ হয়েছে`,
      };
    }

    if (type === "classify_lead") {
      const leadId = str(params, "lead_id");
      const temperature = Temperature.safeParse(str(params, "temperature")?.toLowerCase());
      const grade = Grade.safeParse(str(params, "grade")?.toUpperCase());
      if (!leadId) throw new Error("কোন লিড শ্রেণিবিন্যাস হবে তা বেছে নিন");
      if (!temperature.success || !grade.success) {
        throw new Error("Hot / Warm / Cold এবং A–D গ্রেড দুটোই দিন");
      }

      const { LEAD_OWNER_COLUMNS, leadHeldByOther, LEAD_NOT_YOURS } = await import(
        "@/lib/lead-access.server"
      );
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select(`id, name, ${LEAD_OWNER_COLUMNS}`)
        .eq("id", leadId)
        .maybeSingle();
      if (!lead) throw new Error("লিড পাওয়া যায়নি");
      // An agent may only classify a lead that is actually theirs.
      if (caller.scope === "agent" && leadHeldByOther(lead, caller.profile?.id ?? "")) {
        throw new Error(LEAD_NOT_YOURS);
      }

      const note = str(params, "note");
      const source =
        caller.scope === "agent" ? "manual" : caller.scope === "coordinator" ? "coordinator" : "authority";
      const now = new Date().toISOString();

      const { error: leadError } = await supabaseAdmin
        .from("leads")
        .update({
          temperature: temperature.data,
          grade: grade.data,
          classification_note: note,
          classified_at: now,
          classified_by: actorProfileId,
        })
        .eq("id", leadId);
      if (leadError) throw new Error(leadError.message);

      await supabaseAdmin.from("lead_classifications").insert({
        lead_id: leadId,
        agent_id: actorProfileId,
        temperature: temperature.data,
        grade: grade.data,
        note,
        source,
        classified_at: now,
      });

      const { logLeadEvent } = await import("@/lib/lead-events.server");
      await logLeadEvent({
        leadId,
        agentId: actorProfileId,
        kind: "lead_classified",
        detail: `কমান্ড এজেন্ট: ${temperature.data} / গ্রেড ${grade.data}`,
      });
      await audit(`classified:${temperature.data}/${grade.data}`);
      return {
        ok: true,
        message: `${lead.name} — ${temperature.data} / গ্রেড ${grade.data} সেভ হয়েছে`,
      };
    }

    if (type === "retry_recording") {
      requireAuthority(caller);
      const recordingId = str(params, "recording_id");
      const step = str(params, "step") === "drive" ? "drive" : "analysis";
      if (!recordingId) throw new Error("কোন রেকর্ডিং আবার চালানো হবে তা বেছে নিন");

      if (step === "drive") {
        const { backupRecordingToDrive } = await import("@/lib/recording-drive.server");
        const result = await backupRecordingToDrive(recordingId);
        await audit(`drive:${result.status}`);
        return { ok: true, message: `Drive ব্যাকআপ: ${result.status}` };
      }
      const { analyzeOne } = await import("@/lib/analysis-queue.server");
      const outcome = await analyzeOne(recordingId);
      await audit(`analysis:${outcome}`);
      return { ok: true, message: `ট্রান্সক্রিপ্ট / এআই: ${String(outcome)}` };
    }

    if (type === "verify_drive") {
      requireAuthority(caller);
      const limit = Math.min(num(params, "limit", 25), 100);
      const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
      const { driveFileMeta } = await import("@/lib/gdrive.server");
      const { data: backups } = await admin
        .from("recording_drive_backups")
        .select("id, drive_file_id, status")
        .in("status", ["done", "verified"])
        .not("drive_file_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(limit);

      let verified = 0;
      let missing = 0;
      for (const row of backups ?? []) {
        const meta = row.drive_file_id ? await driveFileMeta(row.drive_file_id) : null;
        const ok = Boolean(meta && !meta.trashed);
        if (ok) verified += 1;
        else missing += 1;
        await admin
          .from("recording_drive_backups")
          .update({
            status: ok ? "verified" : "failed",
            error_message: ok ? null : "DRIVE_VERIFICATION_FAILED — Drive-এ ফাইল পাওয়া যায়নি",
          })
          .eq("id", row.id);
      }
      await audit(`drive_verified:${verified}/missing:${missing}`);
      return {
        ok: missing === 0,
        message: `Drive যাচাই: ${verified}টি ঠিক আছে, ${missing}টি পাওয়া যায়নি`,
      };
    }

    if (type === "acknowledge_alert") {
      requireDispatch(caller);
      const alertId = str(params, "alert_id");
      if (!alertId) throw new Error("কোন সতর্কতা বন্ধ হবে তা বেছে নিন");
      const { error } = await supabaseAdmin
        .from("system_alerts")
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: actorProfileId })
        .eq("id", alertId)
        .is("acknowledged_at", null);
      if (error) throw new Error(error.message);
      await audit("alert_acknowledged");
      return { ok: true, message: "সতর্কতা হ্যান্ডেল করা হয়েছে" };
    }

    if (type === "retry_failed_recordings") {
      requireAuthority(caller);
      const limit = Math.min(num(params, "limit", 5), 20);
      const { data: stuck } = await supabaseAdmin
        .from("call_recordings")
        .select("id")
        .eq("analysis_status", "failed")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (!stuck?.length) {
        await audit("no_failed_recordings");
        return { ok: true, message: "আটকে থাকা কোনো রেকর্ডিং নেই" };
      }
      const { analyzeOne } = await import("@/lib/analysis-queue.server");
      let done = 0;
      let failed = 0;
      for (const row of stuck) {
        try {
          await analyzeOne(row.id);
          done += 1;
        } catch {
          failed += 1;
        }
      }
      await audit(`retry_failed:${done}/failed:${failed}`);
      return {
        ok: failed === 0,
        message: `${done}টি রেকর্ডিং আবার চালানো হয়েছে${failed ? `, ${failed}টি আবারও ব্যর্থ` : ""}`,
      };
    }

    // generate_shift_summary
    requireDispatch(caller);
    const { generateShiftSummary } = await import("@/lib/shift-summary.server");
    const result = await generateShiftSummary();
    await audit("shift_summary_generated");
    return {
      ok: true,
      message:
        "shiftLabel" in (result as Record<string, unknown>)
          ? `শিফট সারসংক্ষেপ তৈরি হয়েছে: ${String((result as { shiftLabel?: string }).shiftLabel ?? "")}`
          : "শিফট সারসংক্ষেপ তৈরি হয়েছে",
    };
  });
