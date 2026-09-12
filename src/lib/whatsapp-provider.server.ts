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

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Official Meta WhatsApp Cloud API implementation. Only ever constructed when
 * real credentials exist; no unofficial WhatsApp automation is used anywhere.
 */
class MetaWhatsApp implements WhatsAppProvider {
  readonly name = "meta-cloud-api";
  readonly status: WhatsAppStatus = "configured";

  constructor(
    private readonly token: string,
    private readonly phoneNumberId: string,
  ) {}

  private async post(body: unknown): Promise<WhatsAppSendResult> {
    try {
      const response = await fetch(`${GRAPH}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        const detail = json.error?.message ?? `HTTP ${response.status}`;
        await logWhatsAppFailure({
          code: "whatsapp_send_failed",
          title: "WhatsApp মেসেজ পাঠানো যায়নি",
          detail,
        });
        return { ok: false, error: detail, status: this.status };
      }
      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? "" };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      await logWhatsAppFailure({
        code: "whatsapp_send_failed",
        title: "WhatsApp সংযোগে সমস্যা",
        detail,
      });
      return { ok: false, error: detail, status: this.status };
    }
  }

  sendMessage(input: { to: string; body: string }) {
    return this.post({ to: input.to, type: "text", text: { preview_url: false, body: input.body } });
  }

  sendTemplate(input: { to: string; template: string; variables?: Record<string, string> }) {
    const params = Object.values(input.variables ?? {}).map((text) => ({ type: "text", text }));
    return this.post({
      to: input.to,
      type: "template",
      template: {
        name: input.template,
        language: { code: "en" },
        ...(params.length ? { components: [{ type: "body", parameters: params }] } : {}),
      },
    });
  }

  /** Stores one inbound message against the matching lead, if any. */
  async receiveMessage(payload: unknown): Promise<{ handled: boolean; reason?: string }> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");

    const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: unknown }> }> }).entry ?? [];
    let handled = 0;
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = (change.value ?? {}) as {
          messages?: Array<{ from?: string; type?: string; text?: { body?: string }; id?: string }>;
          statuses?: Array<{ id?: string; status?: string }>;
        };
        for (const message of value.messages ?? []) {
          const msisdn = normalizeWhatsAppNumber(message.from ?? null);
          if (!msisdn) continue;
          const tail = msisdn.slice(-9);
          const { data: lead } = await supabaseAdmin
            .from("leads")
            .select("id, assigned_to")
            .ilike("phone_number", `%${tail}`)
            .limit(1)
            .maybeSingle();
          await supabaseAdmin.from("whatsapp_interactions").insert({
            lead_id: lead?.id ?? null,
            agent_id: lead?.assigned_to ?? null,
            sender_type: "customer",
            message_type: message.type === "text" ? "text" : "text",
            message_content: message.text?.body ?? `[${message.type ?? "media"}]`,
          });
          handled += 1;
        }
      }
    }
    return handled > 0 ? { handled: true } : { handled: false, reason: "no inbound message in payload" };
  }

  async processWebhook(input: { rawBody: string; signature: string | null }) {
    const appSecret = process.env["WHATSAPP_APP_SECRET"] ?? whatsAppCredentials().webhookSecret;
    if (appSecret) {
      if (!input.signature) return { ok: false, reason: "missing signature" };
      const { createHmac, timingSafeEqual } = await import("crypto");
      const expected = `sha256=${createHmac("sha256", appSecret).update(input.rawBody).digest("hex")}`;
      const got = Buffer.from(input.signature);
      const exp = Buffer.from(expected);
      if (got.length !== exp.length || !timingSafeEqual(got, exp)) {
        return { ok: false, reason: "invalid signature" };
      }
    }
    let payload: unknown;
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      return { ok: false, reason: "invalid json" };
    }
    const result = await this.receiveMessage(payload);
    return result.reason ? { ok: true, reason: result.reason } : { ok: true };
  }

  async getConversation(leadId: string) {
    return new NotConfiguredWhatsApp().getConversation(leadId);
  }

  async getMessageStatus() {
    return "unknown" as WhatsAppMessageStatus;
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const { token, phoneNumberId } = whatsAppCredentials();
  if (token && phoneNumberId) return new MetaWhatsApp(token, phoneNumberId);
  return new NotConfiguredWhatsApp();
}
