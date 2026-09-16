/**
 * Lead Moderators.
 *
 * Two existing agent accounts also moderate the Coordinator Deck: they balance
 * lead loads, moderate tasks and follow-ups, and read team performance. This is
 * a capability granted to their existing identity — no second account, no new
 * credential, no role row rewrite. Recognition is by the employee ID they
 * already have in the production roster.
 */
export const LEAD_MODERATOR_EMPLOYEE_IDS = ["WIN2604", "WIN2606"] as const;

export function isLeadModerator(employeeId: string | null | undefined): boolean {
  if (!employeeId) return false;
  const normalised = employeeId.trim().toUpperCase();
  return LEAD_MODERATOR_EMPLOYEE_IDS.some((id) => id === normalised);
}
