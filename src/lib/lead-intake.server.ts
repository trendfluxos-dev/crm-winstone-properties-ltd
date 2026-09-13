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
      serial_no: input.serialNo?.trim() || (await nextSerialNo()),
      // A newly assigned or self-added lead belongs to the day it arrived, and
      // sits last in the serial order — exactly how the floor hands work out.
      work_date: dhakaToday(),
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

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "lead_created",
    entityType: "lead",
    entityId: created.id,
    actorProfileId: owner,
    actorLabel: input.ownerName?.trim() || null,
    metadata: { phone, source: owner ? "agent_app" : (input.source ?? "webhook") },
  });

  return { leadId: created.id, duplicate: false, assignedTo: owner };
}

/** Today in Dhaka, as the working day a new lead belongs to. */
function dhakaToday(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The next serial in line. A lead added or assigned today lands at the end of
 * the list, so the floor order is never reshuffled by a late arrival.
 */
async function nextSerialNo(): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("leads")
    .select("serial_no")
    .not("serial_no", "is", null)
    .limit(5000);
  let max = 0;
  for (const row of data ?? []) {
    const digits = Number(String(row.serial_no ?? "").replace(/\D/g, ""));
    if (Number.isFinite(digits) && digits > max) max = digits;
  }
  return String(max + 1);
}
