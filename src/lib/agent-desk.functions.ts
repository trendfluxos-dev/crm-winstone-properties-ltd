import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * The agent's own desk actions. Everything here is scoped by the signed-in
 * account: an agent may only submit a lead for themselves and only log a
 * WhatsApp message against a lead that is already assigned to them.
 */

const NewLeadInput = z.object({
  adminToken: z.string().nullable().optional(),
  name: z.string().trim().min(1).max(120),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^(?:\+?880|0)1[3-9]\d{8}$/, "Use a Bangladeshi mobile number"),
  company: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

/** Agents (and supervisors) add a lead; agents keep it in their own queue. */
export const submitMyLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => NewLeadInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const owner = caller.profile?.id ?? null;

    const { data: created, error } = await supabaseAdmin
      .from("leads")
      .insert({
        name: data.name,
        phone_number: data.phoneNumber,
        company: data.company?.trim() || null,
        notes: data.notes?.trim() || null,
        source: "agent_app",
        status: "pending",
        assigned_to: owner,
        assigned_agent_id: owner,
        assignment_source: "self",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Show it immediately in Coordinator Deck / HQ self-claims — no approval step.
    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: created.id,
      agentId: owner,
      kind: "self_claimed",
      detail: `${caller.profile?.name ?? "এজেন্ট"} নতুন লিড যোগ করেছেন — ${data.name}`,
    });

    return { leadId: created.id };
  });

const OpenLeadsInput = z.object({
  adminToken: z.string().nullable().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

/** Leads nobody has taken yet — an agent may pull these into their own queue. */
export const listOpenLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => OpenLeadsInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id, name, phone_number, company, status, source, created_at")
      .is("assigned_to", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return leads ?? [];
  });

const ClaimInput = z.object({
  adminToken: z.string().nullable().optional(),
  leadId: z.string().uuid(),
});

/** The agent takes an untaken lead into their own account. No app needed. */
export const claimLead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ClaimInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none" || !caller.profile) {
      throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
    }
    const me = caller.profile.id;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: me, assigned_agent_id: me, assignment_source: "self" })
      .eq("id", data.leadId)
      .is("assigned_to", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("এই লিড আগেই অন্য কেউ নিয়ে নিয়েছে");

    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: updated.id,
      agentId: me,
      kind: "self_claimed",
      detail: `${caller.profile.name} নিজে লিড নিয়েছেন`,
    });
    await supabaseAdmin
      .from("lead_assignments")
      .insert({ lead_id: updated.id, to_agent_id: me, changed_by: me, source: "self" });

    return { leadId: updated.id };
  });

const MyMessageInput = z.object({
  adminToken: z.string().nullable().optional(),
  leadId: z.string().uuid(),
  senderType: z.enum(["agent", "customer"]).default("agent"),
  messageContent: z.string().trim().min(1).max(4000),
});

/** Log one WhatsApp message in the agent's own lead thread. */
export const logMyWhatsappMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => MyMessageInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (caller.scope === "agent" && caller.profile) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("id, assigned_to")
        .eq("id", data.leadId)
        .maybeSingle();
      if (!lead || lead.assigned_to !== caller.profile.id) {
        throw new Error("এই লিড আপনার তালিকায় নেই");
      }
    }

    const { error } = await supabaseAdmin.from("whatsapp_interactions").insert({
      lead_id: data.leadId,
      agent_id: caller.profile?.id ?? null,
      sender_type: data.senderType,
      message_type: "text",
      message_content: data.messageContent,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
