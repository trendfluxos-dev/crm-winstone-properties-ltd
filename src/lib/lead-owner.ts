/**
 * Who holds a lead. Two owner columns exist for history (`assigned_to` and
 * `assigned_agent_id`); a database trigger keeps them equal, and every read
 * goes through here so an agent's card can never miss one of their own leads.
 */
export function leadOwner(lead: {
  assigned_to?: string | null;
  assigned_agent_id?: string | null;
}): string | null {
  return lead.assigned_to ?? lead.assigned_agent_id ?? null;
}
