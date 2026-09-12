import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  token: z.string().nullable().optional(),
  leadId: z.string().uuid(),
});

/**
 * AI pre-call briefing for one lead.
 * Authority and coordinators may brief any lead; a signed-in agent only their
 * own assigned leads. A client-supplied lead id is never proof of ownership.
 */
export const getPreCallBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.token ?? null);
    if (caller.scope === "none") throw new Error("ব্রিফিং দেখতে সাইন ইন করুন");

    if (caller.scope === "agent") {
      const profileId = caller.profile?.id;
      if (!profileId) throw new Error("এজেন্ট প্রোফাইল পাওয়া যায়নি");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: lead, error } = await supabaseAdmin
        .from("leads")
        .select("id, assigned_to")
        .eq("id", data.leadId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!lead || lead.assigned_to !== profileId) {
        throw new Error("এই লিড আপনার নামে নেই");
      }
    }

    const { buildPreCallBrief } = await import("@/lib/precall.server");
    return buildPreCallBrief(data.leadId);
  });
