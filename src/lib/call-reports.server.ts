/**
 * The mandatory post-call workflow.
 *
 *   CALL -> ENDS -> POST-CALL REPORT -> CATEGORY -> REQUIRED FIELDS -> SUBMIT -> NEXT LEAD
 *
 * The invariant is enforced in the database, not in the UI: `call_reports` has a
 * partial unique index on (agent_id) WHERE status = 'pending', and a BEFORE
 * trigger validates the category and its conditional required fields whenever a
 * row is submitted. This module is the single server-side entry point used by
 * both the web desk and the Android app, so neither can bypass the rule.
 */

export const CALL_CATEGORIES = [
  "hot_lead",
  "follow_up",
  "interested",
  "not_interested",
  "callback",
  "no_answer",
  "wrong_number",
  "closed_converted",
] as const;

export type CallCategory = (typeof CALL_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<CallCategory, string> = {
  hot_lead: "HOT LEAD — খুব সম্ভাবনাময়",
  follow_up: "FOLLOW UP — পরে যোগাযোগ",
  interested: "INTERESTED — আগ্রহী",
  not_interested: "NOT INTERESTED — আগ্রহী নয়",
  callback: "CALLBACK — কলব্যাক চেয়েছেন",
  no_answer: "NO ANSWER — ধরেনি",
  wrong_number: "WRONG NUMBER — ভুল নম্বর",
  closed_converted: "CLOSED / CONVERTED — বিক্রি হয়েছে",
};

const LEAD_STATUS_FOR: Record<CallCategory, "pending" | "contacted" | "follow_up" | "closed"> = {
  hot_lead: "follow_up",
  follow_up: "follow_up",
  interested: "contacted",
  not_interested: "closed",
  callback: "follow_up",
  no_answer: "contacted",
  wrong_number: "closed",
  closed_converted: "closed",
};

export type ReportValidationError = { field: string; message: string };

/** Same rules as the database trigger, so the UI can show them before submit. */
export function validateReport(input: {
  category: string | null;
  summary?: string | null;
  note?: string | null;
  reason?: string | null;
  followUpAt?: string | null;
}): ReportValidationError | null {
  const category = input.category as CallCategory | null;
  if (!category || !CALL_CATEGORIES.includes(category)) {
    return { field: "category", message: "কল ক্যাটেগরি বাছাই করুন" };
  }
  const summary = (input.summary ?? "").trim();
  const note = (input.note ?? "").trim();
  const reason = (input.reason ?? "").trim();

  // Every call, every category: summary + note + follow-up date are mandatory.
  if (summary.length < 2) return { field: "summary", message: "কলের সারাংশ লিখুন" };
  if (note.length < 2) return { field: "note", message: "নোট লিখুন" };
  if (!input.followUpAt) {
    return { field: "followUpAt", message: "ফলো-আপের তারিখ ও সময় দিন" };
  }
  if ((category === "not_interested" || category === "wrong_number") && !reason) {
    return { field: "reason", message: "কারণ লিখুন" };
  }
  return null;
}

/** Is this agent blocked from starting the next call? */
export async function pendingReportFor(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("call_reports")
    .select("id, lead_id, phone_number, call_ended_at, duration_seconds, connected, recording_id")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .maybeSingle();
  return data ?? null;
}

/**
 * Opens the post-call report the moment a call ends. Idempotent per agent: if a
 * report is already open it is returned instead of creating a second one, so a
 * WorkManager retry or an app restart lands on the same durable state.
 */
export async function openCallReport(input: {
  leadId: string;
  agentId: string;
  recordingId?: string | null;
  deviceId?: string | null;
  phoneNumber?: string | null;
  callStartedAt?: string | null;
  durationSeconds?: number;
  connected?: boolean;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const open = await pendingReportFor(input.agentId);
  if (open) {
    if (input.recordingId && !open.recording_id) {
      await supabaseAdmin
        .from("call_reports")
        .update({ recording_id: input.recordingId })
        .eq("id", open.id);
    }
    return { id: open.id, reused: true as const };
  }

  const { data, error } = await supabaseAdmin
    .from("call_reports")
    .insert({
      lead_id: input.leadId,
      agent_id: input.agentId,
      recording_id: input.recordingId ?? null,
      device_id: input.deviceId ?? null,
      phone_number: input.phoneNumber ?? null,
      call_started_at: input.callStartedAt ?? null,
      duration_seconds: input.durationSeconds ?? 0,
      connected: input.connected ?? true,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not open post-call report");

  const { logLeadEvent } = await import("@/lib/lead-events.server");
  await logLeadEvent({
    leadId: input.leadId,
    agentId: input.agentId,
    recordingId: input.recordingId ?? null,
    kind: "call_ended",
    detail: "কল শেষ — পোস্ট-কল রিপোর্ট বাকি",
  });

  return { id: data.id, reused: false as const };
}

/**
 * Submits the report: validates, closes it, moves the lead forward and creates
 * the linked calendar event for FOLLOW UP / CALLBACK. The human category is
 * final — an AI suggestion is stored beside it and never overwrites it.
 */
export async function submitCallReport(input: {
  reportId: string;
  agentId: string;
  category: string;
  note?: string | null;
  reason?: string | null;
  followUpAt?: string | null;
  reminderMinutes?: number;
  aiDecision?: "accepted" | "edited" | "rejected" | null;
}) {
  const invalid = validateReport(input);
  if (invalid) throw new Error(invalid.message);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const category = input.category as CallCategory;

  const { data: report, error: readError } = await supabaseAdmin
    .from("call_reports")
    .select("*")
    .eq("id", input.reportId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!report) throw new Error("রিপোর্ট পাওয়া যায়নি");
  if (report.agent_id !== input.agentId) throw new Error("এই রিপোর্ট আপনার নয়");
  if (report.status === "submitted") return { ok: true, alreadySubmitted: true as const };

  const { error } = await supabaseAdmin
    .from("call_reports")
    .update({
      status: "submitted",
      category,
      note: input.note?.trim() || null,
      reason: input.reason?.trim() || null,
      follow_up_at: input.followUpAt ?? null,
      ai_decision: input.aiDecision ?? null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", input.reportId)
    .eq("agent_id", input.agentId);
  if (error) throw new Error(error.message);

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone_number, status")
    .eq("id", report.lead_id)
    .maybeSingle();

  await supabaseAdmin
    .from("leads")
    .update({
      status: LEAD_STATUS_FOR[category],
      outcome_category: category,
      notes: input.note?.trim() || input.reason?.trim() || null,
      last_call_at: new Date().toISOString(),
    })
    .eq("id", report.lead_id);

  let followUpId: string | null = null;
  if ((category === "follow_up" || category === "callback") && input.followUpAt) {
    const { data: event } = await supabaseAdmin
      .from("follow_up_events")
      .insert({
        lead_id: report.lead_id,
        agent_id: input.agentId,
        report_id: report.id,
        recording_id: report.recording_id,
        customer_name: lead?.name ?? null,
        phone_number: lead?.phone_number ?? report.phone_number,
        category,
        priority: category === "callback" ? "high" : "normal",
        note: input.note?.trim() || null,
        scheduled_at: input.followUpAt,
        reminder_minutes: input.reminderMinutes ?? 15,
        status: "upcoming",
      })
      .select("id")
      .single();
    followUpId = event?.id ?? null;
  }

  const { logLeadEvent } = await import("@/lib/lead-events.server");
  await logLeadEvent({
    leadId: report.lead_id,
    agentId: input.agentId,
    recordingId: report.recording_id,
    kind: "outcome_logged",
    detail: `${CATEGORY_LABEL[category]}${input.followUpAt ? ` — ফলো-আপ ${new Date(input.followUpAt).toLocaleString("bn-BD")}` : ""}`,
  });

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "call_report_submitted",
    entityType: "call_report",
    entityId: report.id,
    actorProfileId: input.agentId,
    metadata: {
      leadId: report.lead_id,
      category,
      aiDecision: input.aiDecision ?? null,
      followUpAt: input.followUpAt ?? null,
    },
  });

  return { ok: true, followUpId };
}

/**
 * AI report assistant.
 *
 * Built from the analysis already stored on the recording (Lovable AI
 * transcription + call analysis) — no second model call, no invented data. The
 * suggestion is advisory only: it is persisted separately in
 * `call_reports.ai_suggestion` and never written into `category`, which stays
 * the agent's decision.
 */
export type AiSuggestion = {
  summary: string[];
  requirements: string[];
  objections: string[];
  interest: "high" | "medium" | "low" | "unknown";
  suggestedCategory: CallCategory | null;
  nextAction: string;
  suggestedFollowUpAt: string | null;
  source: "call_analysis";
};

function suggestionFrom(recording: {
  ai_summary: string | null;
  sentiment: string | null;
  customer_objections: string[] | null;
  deal_stage: string | null;
  duration_seconds: number;
}): AiSuggestion {
  const summary = (recording.ai_summary ?? "")
    .split("\n")
    .map((line) => line.replace(/^[•\-\s]+/, "").trim())
    .filter(Boolean);
  const objections = recording.customer_objections ?? [];
  const stage = (recording.deal_stage ?? "").toLowerCase();

  const interest: AiSuggestion["interest"] =
    recording.sentiment === "positive" ? "high"
    : recording.sentiment === "neutral" ? "medium"
    : recording.sentiment ? "low"
    : "unknown";

  let suggested: CallCategory | null = null;
  if (objections.some((o) => /কলব্যাক|callback|পরে ফোন/i.test(o))) suggested = "callback";
  else if (recording.duration_seconds < 6) suggested = "no_answer";
  else if (stage.includes("won") || stage.includes("closed")) suggested = "closed_converted";
  else if (recording.sentiment === "positive") suggested = "hot_lead";
  else if (recording.sentiment === "critical") suggested = "not_interested";
  else if (objections.length > 0) suggested = "follow_up";
  else if (recording.sentiment === "neutral") suggested = "interested";

  const followUp = new Date();
  followUp.setDate(followUp.getDate() + 1);
  followUp.setHours(11, 0, 0, 0);

  return {
    summary,
    requirements: summary.filter((line) => /দরকার|প্রয়োজন|চাই|need|want|require/i.test(line)),
    objections,
    interest,
    suggestedCategory: suggested,
    nextAction:
      suggested === "closed_converted"
        ? "চুক্তির কাগজপত্র পাঠান"
        : suggested === "not_interested"
          ? "এই লিড বন্ধ করে কারণ লিখুন"
          : "আগামীকাল সকালে ফলো-আপ কল দিন",
    suggestedFollowUpAt:
      suggested === "follow_up" || suggested === "hot_lead" || suggested === "callback"
        ? followUp.toISOString()
        : null,
    source: "call_analysis",
  };
}

/** The open report plus lead, recording state and the AI suggestion. */
export async function loadPendingReportDetail(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: report } = await supabaseAdmin
    .from("call_reports")
    .select("*")
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .maybeSingle();
  if (!report) return null;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone_number, company")
    .eq("id", report.lead_id)
    .maybeSingle();

  const { data: recording } = report.recording_id
    ? await supabaseAdmin
        .from("call_recordings")
        .select(
          "id, analysis_status, analysis_error, ai_summary, sentiment, customer_objections, deal_stage, duration_seconds, is_two_sided, recorder_source",
        )
        .eq("id", report.recording_id)
        .maybeSingle()
    : { data: null };

  let suggestion = (report.ai_suggestion as AiSuggestion | null) ?? null;
  if (!suggestion && recording && recording.analysis_status === "completed") {
    suggestion = suggestionFrom(recording);
    await supabaseAdmin
      .from("call_reports")
      .update({ ai_suggestion: suggestion })
      .eq("id", report.id);
  }

  return { report, lead, recording, suggestion };
}
