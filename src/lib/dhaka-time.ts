/**
 * Single source of truth for Dhaka (UTC+6) calendar boundaries.
 *
 * Dhaka has no DST, so the offset is a constant +6 hours. 00:00 Dhaka is
 * 18:00 UTC on the previous day. Every billing surface (meter, report,
 * month-close job, budget caps) must use these helpers so a row never lands
 * in two different months depending on which file asked.
 */

export const DHAKA_OFFSET_MS = 6 * 3_600_000;

/** yyyy-mm-dd for the Dhaka calendar day containing `at`. */
export function dhakaDayKey(at: Date | string | number = Date.now()): string {
  const t = at instanceof Date ? at.getTime() : new Date(at).getTime();
  return new Date(t + DHAKA_OFFSET_MS).toISOString().slice(0, 10);
}

/** yyyy-mm for the Dhaka calendar month containing `at`. */
export function dhakaMonthKey(at: Date | string | number = Date.now()): string {
  return dhakaDayKey(at).slice(0, 7);
}

export type PeriodBounds = { start: string; end: string; label: string };

/** UTC ISO bounds of a Dhaka calendar month, end-exclusive. */
export function dhakaMonthBounds(month: string): PeriodBounds {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1, -6, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, -6, 0, 0));
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
  return { start: start.toISOString(), end: end.toISOString(), label };
}

/** The Dhaka month immediately before `month` (yyyy-mm). */
export function previousDhakaMonth(month: string): string {
  const [y = 0, m = 1] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Number of days in the Dhaka calendar month. */
export function dhakaMonthDays(month: string): number {
  const [y = 0, m = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** How many days of `month` have already elapsed in Dhaka time (min 1). */
export function dhakaMonthElapsedDays(month: string, now: Date = new Date()): number {
  const nowMonth = dhakaMonthKey(now);
  if (month < nowMonth) return dhakaMonthDays(month);
  if (month > nowMonth) return 0;
  return Math.max(1, Number(dhakaDayKey(now).slice(8, 10)));
}
