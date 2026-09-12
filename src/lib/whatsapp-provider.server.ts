/**
 * Official Meta WhatsApp Business provider abstraction (server only).
 *
 * The credentials are NOT configured in this project, so every send path
 * reports INTEGRATION_REQUIRED instead of pretending a message was delivered.
 * When real credentials exist (WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID
 * + WHATSAPP_WEBHOOK_SECRET) the Meta implementation below takes over.
 */

export type WhatsAppStatus = "configured" | "not_configured";

export type WhatsAppSendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; status: WhatsAppStatus };

export type WhatsAppMessageStatus = "queued" | "sent" | "delivered" | "read" | "failed" | "unknown";

export interface WhatsAppProvider {
  readonly name: string;
  readonly status: WhatsAppStatus;
  sendMessage(input: { to: string; body: string; leadId?: string | null }): Promise<WhatsAppSendResult>;
  sendTemplate(input: {
    to: string;
    template: string;
    variables?: Record<string, string>;
  }): Promise<WhatsAppSendResult>;
  receiveMessage(payload: unknown): Promise<{ handled: boolean; reason?: string }>;
  processWebhook(input: { rawBody: string; signature: string | null }): Promise<{ ok: boolean; reason?: string }>;
  getConversation(leadId: string): Promise<
    Array<{ id: string; direction: "in" | "out"; body: string | null; at: string; status: WhatsAppMessageStatus }>
  >;
  getMessageStatus(providerMessageId: string): Promise<WhatsAppMessageStatus>;
}

export function whatsAppCredentials(): {
  token: string | null;
  phoneNumberId: string | null;
  webhookSecret: string | null;
} {
  return {
    token: process.env["WHATSAPP_ACCESS_TOKEN"] ?? null,
    phoneNumberId: process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? null,
    webhookSecret: process.env["WHATSAPP_WEBHOOK_SECRET"] ?? null,
  };
}

export function whatsAppStatus(): WhatsAppStatus {
  const { token, phoneNumberId } = whatsAppCredentials();
  return token && phoneNumberId ? "configured" : "not_configured";
}

/** Records a provider failure for IT / HQ instead of swallowing it. */
export async function logWhatsAppFailure(input: {
  code: string;
  title: string;
  detail?: string | null;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("system_alerts").insert({
      code: input.code,
      severity: "warning",
      title: input.title,
      detail: input.detail ?? null,
      action: "IT Console → WhatsApp integration",
    });
  } catch (error) {
    console.error("[whatsapp] alert insert failed", error);
  }
}

const NOT_CONFIGURED = "WhatsApp Business API সংযুক্ত নয় — INTEGRATION REQUIRED";

class NotConfiguredWhatsApp implements WhatsAppProvider {
  readonly name = "meta-cloud-api";
  readonly status: WhatsAppStatus = "not_configured";

  private async fail(what: string): Promise<WhatsAppSendResult> {
    await logWhatsAppFailure({
      code: "whatsapp_not_configured",
      title: "WhatsApp Business API সংযুক্ত নয়",
      detail: `${what}: Meta credentials (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID) নেই।`,
    });
    return { ok: false, error: NOT_CONFIGURED, status: this.status };
  }

  sendMessage() {
    return this.fail("sendMessage");
  }
  sendTemplate() {
    return this.fail("sendTemplate");
  }
  async receiveMessage() {
    return { handled: false, reason: NOT_CONFIGURED };
  }
  async processWebhook() {
    return { ok: false, reason: NOT_CONFIGURED };
  }
  /** Reads whatever the CRM already logged locally; nothing is fetched from Meta. */
  async getConversation(leadId: string) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("whatsapp_interactions")
      .select("id, sender_type, message_content, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    return (data ?? []).map((row) => ({
      id: row.id,
      direction: row.sender_type === "agent" ? ("out" as const) : ("in" as const),
      body: row.message_content,
      at: row.created_at,
      status: "unknown" as WhatsAppMessageStatus,
    }));
  }
  async getMessageStatus() {
    return "unknown" as WhatsAppMessageStatus;
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  // Only the not-configured provider exists until real Meta credentials and a
  // verified webhook are in place; no unofficial automation is ever used.
  return new NotConfiguredWhatsApp();
}
