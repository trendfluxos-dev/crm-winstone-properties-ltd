import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Is the official Meta WhatsApp Business API actually connected? */
export const getWhatsappIntegrationStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { whatsAppStatus } = await import("@/lib/whatsapp-provider.server");
  return { status: whatsAppStatus() };
});

const HandoffInput = z.object({
  adminToken: z.string().nullable().optional(),
  leadId: z.string().uuid().nullable().optional(),
  phone: z.string().trim().min(4).max(24),
  note: z.string().trim().max(400).nullable().optional(),
});

/**
 * Records that an agent opened WhatsApp for a lead. This is a hand-off trail,
 * NOT a delivery claim: the message travels through the agent's own WhatsApp.
 */
export const logWhatsappHandoff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HandoffInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
    if (!data.leadId) return { ok: true as const, logged: false };

    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: data.leadId,
      agentId: caller.profile?.id ?? null,
      kind: "whatsapp_message",
      detail: `হোয়াটসঅ্যাপ খোলা হয়েছে (${data.phone})${data.note ? ` · ${data.note}` : ""}`,
    });
    return { ok: true as const, logged: true };
  });

const SendInput = z.object({
  adminToken: z.string().nullable().optional(),
  leadId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

/**
 * Sends a WhatsApp message through the official Meta Cloud API and logs it in
 * the lead thread. Refuses honestly when the API is not configured.
 */
export const sendWhatsappMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SendInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const { getWhatsAppProvider } = await import("@/lib/whatsapp-provider.server");
    const provider = getWhatsAppProvider();
    if (provider.status !== "configured") {
      return {
        ok: false as const,
        status: "not_configured" as const,
        error: "WhatsApp Business API সংযুক্ত নয়",
      };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, assigned_to, phone_number")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("লিড পাওয়া যায়নি");
    if (caller.scope === "agent" && lead.assigned_to !== caller.profile?.id) {
      throw new Error("এই লিড আপনার তালিকায় নেই");
    }

    const { normalizeWhatsAppNumber } = await import("@/lib/whatsapp");
    const to = normalizeWhatsAppNumber(lead.phone_number);
    if (!to) throw new Error("নম্বরটি সঠিক নয়");

    const result = await provider.sendMessage({ to, body: data.body, leadId: lead.id });
    if (!result.ok) return { ok: false as const, status: "failed" as const, error: result.error };

    await supabaseAdmin.from("whatsapp_interactions").insert({
      lead_id: lead.id,
      agent_id: caller.profile?.id ?? null,
      sender_type: "agent",
      message_type: "text",
      message_content: data.body,
      provider: "meta-cloud-api",
      provider_message_id: result.providerMessageId || null,
      // Meta's webhook moves this to delivered / read / failed.
      status: "sent",
      status_updated_at: new Date().toISOString(),
    });
    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: lead.id,
      agentId: caller.profile?.id ?? null,
      kind: "whatsapp_message",
      detail: `WhatsApp Business API দিয়ে মেসেজ পাঠানো হয়েছে`,
    });
    return { ok: true as const, providerMessageId: result.providerMessageId };
  });
