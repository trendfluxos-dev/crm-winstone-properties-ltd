/** Tells the agent UI whether a lead may be contacted, from server state only. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { resolveCaller } from "@/lib/access.server";

export const leadContactStatus = createServerFn({ method: "POST" })
  .inputValidator((data: object) => z.object({ leadId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const caller = await resolveCaller(null);
    if (!caller.profile) throw new Error("লগইন প্রয়োজন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("id, phone_number, assigned_to, assigned_agent_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("লিড পাওয়া যায়নি");

    const assigned = lead.assigned_to ?? lead.assigned_agent_id;
    if (caller.scope === "agent" && assigned && assigned !== caller.profile.id) {
      throw new Error("এই লিড আপনার নয়");
    }

    const { findDoNotContact, latestConsent, recordingAllowed } = await import("@/lib/comms-guard.server");

    const voiceBlock = await findDoNotContact(lead.phone_number, "voice");
    const waBlock = await findDoNotContact(lead.phone_number, "whatsapp");
    const consent = await latestConsent(lead.phone_number, "recording");
    // Recording happens on the agent's own device (SIM call); the agent announces
    // it at call start, so the notice is always in place unless the customer refused.
    const notice = true;

    return {
      optedOut: Boolean(voiceBlock || waBlock),
      voiceBlocked: Boolean(voiceBlock),
      whatsappBlocked: Boolean(waBlock),
      reason: voiceBlock?.reason ?? waBlock?.reason ?? null,
      recordingConsent: consent ? (consent.granted ? "opted_in" : "opted_out") : "unknown",
      recordingAllowed: await recordingAllowed(lead.phone_number, notice),
      recordingNoticeConfigured: notice,
    };
  });
