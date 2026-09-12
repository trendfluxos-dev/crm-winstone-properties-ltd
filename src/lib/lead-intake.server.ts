/**
 * One single place where a lead enters the CRM — whether the agent typed it on
 * the web desk or on the phone app. Both paths normalise the number the same
 * way, de-duplicate the same way, and land in the same agent's queue with the
 * same timeline entry, so nothing about the lead reveals where it came from.
 */

export type LeadIntakeResult = {
  leadId: string;
  duplicate: boolean;
  assignedTo: string | null;
};

/** Bangladesh-first: 01XXXXXXXXX / +8801XXXXXXXXX / 8801XXXXXXXXX -> 8801XXXXXXXXX. */
export function normalizeLeadPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return digits;
  if (/^1\d{9}$/.test(digits)) return `880${digits}`;
  return raw.replace(/[^\d+]/g, "") || raw.trim();
}

export async function intakeLead(input: {
  name: string;
  phoneNumber: string;
  company?: string | null;
  notes?: string | null;
  address?: string | null;
  serialNo?: string | null;
  /** Who handed this lead over — the agent themselves, or head office. */
  referenceBy?: string | null;
  /** Profile id that should own the lead, or null for unassigned. */
  ownerId: string | null;
  /** Free-form label used only for round-robin webhook traffic. */
  source?: string;
  /** Display name used in the timeline entry. */
  ownerName?: string | null;
}): Promise<LeadIntakeResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const phone = normalizeLeadPhone(input.phoneNumber);

  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id, assigned_to")
    .eq("phone_number", phone)
    .maybeSingle();
  if (existing) {
    return { leadId: existing.id, duplicate: true, assignedTo: existing.assigned_to ?? null };
  }

  const owner = input.ownerId ?? null;
  const { data: created, error } = await supabaseAdmin
    .from("leads")
    .insert({
      name: input.name,
      phone_number: phone,
      company: input.company?.trim() || null,
      notes: input.notes?.trim() || null,
      address: input.address?.trim() || null,
      serial_no: input.serialNo?.trim() || null,
      reference_by: input.referenceBy?.trim() || (owner ? input.ownerName?.trim() || null : null),
      source: owner ? "agent_app" : (input.source ?? "webhook"),
      status: "pending",
      assigned_to: owner,
      assigned_agent_id: owner,
      assignment_source: owner ? "self" : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (owner) {
    const { logLeadEvent } = await import("@/lib/lead-events.server");
    await logLeadEvent({
      leadId: created.id,
      agentId: owner,
      kind: "self_claimed",
      detail: `${input.ownerName?.trim() || "এজেন্ট"} নতুন লিড যোগ করেছেন — ${input.name}`,
    });
  }

  return { leadId: created.id, duplicate: false, assignedTo: owner };
}
