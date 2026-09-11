/**
 * Shared resolution helpers for the Android agent app ingest endpoints.
 *
 * The phone only reliably knows two things about a call or WhatsApp touch:
 * the agent's employee id (WIN26xx) and the customer's phone number.
 * These helpers turn that into the profile / lead rows the CRM stores, and
 * create the lead when the agent dialled or messaged a number that is not in
 * the CRM yet, so nothing the phone sends is ever dropped.
 */

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 13 && digits.startsWith("880")) return `0${digits.slice(3)}`;
  if (digits.length === 11 && digits.startsWith("01")) return digits;
  if (digits.length === 10 && digits.startsWith("1")) return `0${digits}`;
  return raw.trim();
}

export type ResolvedAgent = { id: string; name: string; employee_id: string | null } | null;

/** Accepts a profile id, an employee id (WIN26xx), or nothing. */
export async function resolveAgent(input: {
  agentId?: string | null;
  employeeId?: string | null;
}): Promise<ResolvedAgent> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (input.agentId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, name, employee_id")
      .eq("id", input.agentId)
      .maybeSingle();
    if (data) return data;
  }

  const employeeId = input.employeeId?.trim();
  if (employeeId) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, name, employee_id")
      .ilike("employee_id", employeeId)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

/**
 * Finds the lead by id or phone number. When only a phone number is known and
 * no lead matches, a lead is created and assigned to the posting agent so the
 * call log / message still lands somewhere the CRM can show it.
 */
export async function resolveLeadId(input: {
  leadId?: string | null;
  phoneNumber?: string | null;
  agentId?: string | null;
  source: string;
  fallbackName?: string | null;
}): Promise<{ leadId: string | null; created: boolean }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (input.leadId) return { leadId: input.leadId, created: false };
  if (!input.phoneNumber) return { leadId: null, created: false };

  const phone = normalizePhone(input.phoneNumber);
  const variants = Array.from(new Set([phone, input.phoneNumber.trim()]));

  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("id")
    .in("phone_number", variants)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { leadId: existing.id, created: false };

  const { data: created, error } = await supabaseAdmin
    .from("leads")
    .insert({
      name: input.fallbackName?.trim() || `Unknown ${phone}`,
      phone_number: phone,
      source: input.source,
      status: "contacted",
      assigned_to: input.agentId ?? null,
      assigned_agent_id: input.agentId ?? null,
    })
    .select("id")
    .single();
  if (error || !created) return { leadId: null, created: false };

  return { leadId: created.id, created: true };
}
