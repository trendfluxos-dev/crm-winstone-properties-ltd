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
