import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveCaller } from "@/lib/access.server";

const InitiateInput = z.object({
  leadId: z.string().uuid(),
});

export const initiateTwilioCall = createServerFn({ method: "POST" })
  .middleware([async ({ context, next }) => {
    const caller = await resolveCaller(context.adminToken);
    if (caller.scope !== "agent" || !caller.profile) {
      throw new Error("শুধুমাত্র এজেন্ট Twilio কল শুরু করতে পারেন");
    }
    return next({
      context: {
        ...context,
        caller,
        adminToken: null as string | null,
      } as typeof context & { caller: NonNullable<typeof caller>; adminToken: string | null },
    });
  }])
  .inputValidator((data: { leadId: string }) => InitiateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createOutboundCall, normalizePhone, twilioConfig, resolvePhoneNumber, isConfigured } = await import(
      "@/lib/twilio.server"
    );
    if (!isConfigured()) {
      throw new Error("Twilio কনফিগার করা নেই। IT Console-এ সেটআপ করুন।");
    }

    const cfg = twilioConfig();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profile = context.caller.profile;

    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, phone_number, assigned_to, assigned_agent_id, name")
      .eq("id", data.leadId)
      .maybeSingle();

    if (!lead) throw new Error("লিড পাওয়া যায়নি");

    // An agent may call their own leads or any lead assigned to them.
    const assignedId = lead.assigned_to ?? lead.assigned_agent_id;
    if (assignedId && assignedId !== profile.id) {
      throw new Error("আপনি অন্যের লিডে কল করতে পারবেন না");
    }

    if (!profile.phone) {
      throw new Error("আপনার প্রোফাইলে ফোন নম্বর নেই");
    }

    const agentPhone = normalizePhone(profile.phone);
    const customerPhone = normalizePhone(lead.phone_number);
    const from = cfg.phoneNumber ?? (await resolvePhoneNumber(cfg));
    if (!from) throw new Error("কোনো Twilio ফোন নম্বর কনফিগার করা নেই");

    const result = await createOutboundCall({
      agentPhone,
      customerPhone,
      leadId: lead.id,
      agentId: profile.id,
      record: true,
    });

    return result;
  });

const HealthInput = z.object({});

export const twilioHealth = createServerFn({ method: "POST" })
  .middleware([async ({ context, next }) => {
    const caller = await resolveCaller(context.adminToken);
    if (caller.scope !== "authority" && caller.scope !== "coordinator") {
      throw new Error("শুধুমাত্র HQ/Coordinator দেখতে পারবেন");
    }
    return next({ context });
  }])
  .inputValidator((data: object) => HealthInput.parse(data))
  .handler(async () => {
    const { twilioConfig, isConfigured } = await import("@/lib/twilio.server");
    const cfg = twilioConfig();
    const configured = isConfigured();
    const projectUrls = await import("@/lib/project-urls");
    const webhookBase = cfg.webhookBase || projectUrls.publicBaseUrl();

    return {
      configured,
      hasApiKey: !!cfg.apiKey,
      hasAccountSid: !!cfg.accountSid,
      hasAuthToken: !!cfg.authToken,
      hasPhoneNumber: !!cfg.phoneNumber,
      phoneNumber: cfg.phoneNumber,
      recordingEnabled: cfg.recordingEnabled,
      consentNotice: cfg.recordingConsentNotice,
      voiceUrl: `${webhookBase}/api/public/twilio/voice`,
      statusUrl: `${webhookBase}/api/public/twilio/call-status`,
      recordingUrl: `${webhookBase}/api/public/twilio/recording`,
      whatsappUrl: `${webhookBase}/api/public/twilio/whatsapp`,
    };
  });
