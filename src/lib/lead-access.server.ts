/**
 * One place decides who owns a lead.
 *
 * The schema keeps two owner columns (`assigned_to` from the original CRM and
 * `assigned_agent_id` added later by the dispatch flow). Routes that looked at
 * only one of them let a lead assigned through the other column look unowned,
 * so a second agent's phone could sync a call onto it. Every owner check must
 * read both columns through this helper.
 */
export type LeadOwnerRow = {
  assigned_to?: string | null;
  assigned_agent_id?: string | null;
};

/** Columns any owner check must select. */
export const LEAD_OWNER_COLUMNS = "assigned_to, assigned_agent_id";

export function leadOwnerId(lead: LeadOwnerRow | null | undefined): string | null {
  return lead?.assigned_to ?? lead?.assigned_agent_id ?? null;
}

/** True when the lead belongs to somebody other than this profile. */
export function leadHeldByOther(lead: LeadOwnerRow | null | undefined, profileId: string): boolean {
  const owner = leadOwnerId(lead);
  return Boolean(owner) && owner !== profileId;
}

export const LEAD_NOT_YOURS = "এই লিড আপনার তালিকায় নেই";
