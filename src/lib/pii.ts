/**
 * Phone masking for supervision surfaces.
 *
 * Coordinators and Executive HQ manage work, they do not dial customers, so
 * every phone number that leaves the server for those surfaces is reduced to a
 * recognisable but non-dialable shape. Agents keep full numbers for their own
 * leads; nothing here touches the stored data.
 */

/** Masks only when the caller is a supervision surface; agents keep raw numbers. */
export function maskWhen(mask: boolean, value: string | null | undefined): string | null {
  return mask ? maskPhone(value) : (value ?? null);
}

/** `01712345678` -> `017••••••78`. Returns null for empty input. */
export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) return "••••";
  const head = digits.slice(0, 3);
  const tail = digits.slice(-2);
  return `${head}${"•".repeat(Math.max(2, digits.length - 5))}${tail}`;
}

export type MaskContext = {
  /** Pure supervision surfaces (HQ, non-dialling coordinators): mask everything. */
  maskPii: boolean;
  /** Lead Moderators keep their own agent workflow but supervise others. */
  leadModerator: boolean;
  /** The caller's own profile id, when they have an account. */
  selfId: string | null;
};

/**
 * Row-aware masking.
 *
 * A Lead Moderator is both an agent and a supervisor: their own customers stay
 * dialable, every other agent's customer is reduced to the masked shape, so a
 * team-supervision payload never carries somebody else's raw number.
 */
export function maskForCaller(
  ctx: MaskContext,
  ownerId: string | null | undefined,
  value: string | null | undefined,
): string | null {
  if (ctx.maskPii) return maskPhone(value);
  if (ctx.leadModerator && (!ownerId || ownerId !== ctx.selfId)) return maskPhone(value);
  return value ?? null;
}
