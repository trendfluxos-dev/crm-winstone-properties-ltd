/**
 * Organisation-wide audit history.
 *
 * Every privileged or state-changing action (account decisions, role changes,
 * lead creation / assignment, submitted call reports, device registration,
 * recording reprocessing) appends one immutable row here. Reads are limited to
 * admin / coordinator roles by RLS; there is no UPDATE or DELETE policy, so
 * nobody — including IT — can rewrite the history through the Data API.
 *
 * Writes are best-effort: a logging failure must never break the action.
 */

export type AuditAction =
  | "account_approved"
  | "account_rejected"
  | "role_changed"
  | "lead_created"
  | "lead_imported"
  | "lead_assigned"
  | "lead_self_claimed"
  | "call_report_submitted"
  | "device_registered"
  | "device_revoked"
  | "recording_reprocessed"
  | "alert_acknowledged"
  | "report_sheet_sync"
  | "agent_account_created"
  | "agent_account_updated"
  | "shift_summary_generated"
  | "shift_summary_hq_cleared"
  | "document_summarized";

export async function logAudit(input: {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  actorProfileId?: string | null;
  actorLabel?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_logs").insert({
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      actor_profile_id: input.actorProfileId ?? null,
      actor_label: input.actorLabel ?? null,
      metadata: (input.metadata ?? {}) as never,
    });
  } catch (error) {
    console.error("[audit] insert failed", error);
  }
}
