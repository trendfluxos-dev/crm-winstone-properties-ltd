/**
 * Automatic call lifecycle trail for a lead.
 *
 * Every stage the phone app reports (dial started, call connected, recording
 * stored, transcript ready) is appended here, so Desk / Coordinator Deck /
 * Executive HQ can show progress live without anyone pressing refresh.
 * Writes are best-effort: a logging failure must never break ingestion.
 */

export type LeadEventKind =
  | "call_started"
  | "call_connected"
  | "call_ended"
  | "recording_saved"
  | "transcript_ready"
  | "transcript_failed"
  | "outcome_logged"
  | "whatsapp_message"
  | "self_claimed"
  | "lead_classified"
  | "workday_moved";

export async function logLeadEvent(input: {
  leadId: string | null;
  agentId?: string | null;
  recordingId?: string | null;
  kind: LeadEventKind;
  detail?: string | null;
}): Promise<void> {
  if (!input.leadId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("lead_events").insert({
      lead_id: input.leadId,
      agent_id: input.agentId ?? null,
      recording_id: input.recordingId ?? null,
      kind: input.kind,
      detail: input.detail ?? null,
    });
  } catch (error) {
    console.error("[lead-events] insert failed", error);
  }
}
