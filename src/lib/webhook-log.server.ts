/**
 * Webhook delivery log + idempotency (server only).
 *
 * Every provider callback is claimed on the provider's own event id. A repeat
 * delivery increments `attempts` and is reported as not fresh, so handlers can
 * skip duplicate side effects without silently dropping the retry.
 */

export type WebhookClaim = {
  id: string | null;
  fresh: boolean;
};

export async function claimWebhookEvent(input: {
  provider: string;
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}): Promise<WebhookClaim> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data, error } = await supabaseAdmin
    .from("webhook_deliveries")
    .insert({
      provider: input.provider,
      event_id: input.eventId,
      event_type: input.eventType,
      signature_valid: input.signatureValid,
      payload: input.payload as never,
      status: "received",
    })
    .select("id")
    .maybeSingle();

  if (!error && data) return { id: data.id, fresh: true };

  // Duplicate delivery (or an insert race): record the retry attempt.
  const { data: existing } = await supabaseAdmin
    .from("webhook_deliveries")
    .select("id, attempts, status")
    .eq("provider", input.provider)
    .eq("event_id", input.eventId)
    .eq("event_type", input.eventType)
    .maybeSingle();

  if (!existing) {
    console.error("[webhook] claim failed", error);
    return { id: null, fresh: true };
  }

  await supabaseAdmin
    .from("webhook_deliveries")
    .update({ attempts: existing.attempts + 1 })
    .eq("id", existing.id);

  // A previously failed delivery is allowed to run again; a processed one is not.
  return { id: existing.id, fresh: existing.status === "failed" };
}

export async function markWebhookProcessed(id: string | null, note?: string): Promise<void> {
  if (!id) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("webhook_deliveries")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      error_message: note ?? null,
    })
    .eq("id", id);
}

export async function markWebhookFailed(id: string | null, error: unknown): Promise<void> {
  if (!id) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("webhook_deliveries")
    .update({ status: "failed", error_message: String(error).slice(0, 800) })
    .eq("id", id);
}

export async function markWebhookRejected(input: {
  provider: string;
  eventType: string;
  reason: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("webhook_deliveries").insert({
    provider: input.provider,
    event_id: `rejected-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event_type: input.eventType,
    signature_valid: false,
    status: "rejected",
    error_message: input.reason,
    payload: {} as never,
  });
}
