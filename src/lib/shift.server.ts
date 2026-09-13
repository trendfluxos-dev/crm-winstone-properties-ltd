/**
 * Dhaka working shifts. Agents call and submit updates inside these windows;
 * the shift summary is generated right after each window closes.
 */

export type ShiftId = "morning" | "evening";

export const SHIFTS: {
  id: ShiftId;
  label: string;
  startMinutes: number;
  endMinutes: number;
  summaryMinutes: number;
}[] = [
  // 09:00 – 12:45, summary at 12:50
  {
    id: "morning",
    label: "সকালের শিফট (৯:০০–১২:৪৫)",
    startMinutes: 9 * 60,
    endMinutes: 12 * 60 + 45,
    summaryMinutes: 12 * 60 + 50,
  },
  // 14:00 – 17:20, summary at 17:30
  {
    id: "evening",
    label: "বিকেলের শিফট (২:০০–৫:২০)",
    startMinutes: 14 * 60,
    endMinutes: 17 * 60 + 20,
    summaryMinutes: 17 * 60 + 30,
  },
];

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

/** Dhaka wall-clock parts of an instant (UTC+6, no DST). */
export function dhakaParts(at: Date = new Date()) {
  const shifted = new Date(at.getTime() + DHAKA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
    dateKey: shifted.toISOString().slice(0, 10),
  };
}

/** Turn a Dhaka date + minute-of-day into a real UTC instant. */
export function dhakaInstant(dateKey: string, minutes: number): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcMidnight = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return new Date(utcMidnight + minutes * 60_000 - DHAKA_OFFSET_MS);
}

/** The shift the agent is inside right now, or null outside working hours. */
export function currentShift(at: Date = new Date()) {
  const { minutes } = dhakaParts(at);
  return SHIFTS.find((s) => minutes >= s.startMinutes && minutes <= s.endMinutes) ?? null;
}

/**
 * The shift whose summary is due now: the window that closed most recently
 * today. Used by the 12:50 and 17:30 jobs, tolerant of a few late minutes.
 */
export function shiftDueForSummary(at: Date = new Date()) {
  const { minutes, dateKey } = dhakaParts(at);
  const due = [...SHIFTS]
    .filter((s) => minutes >= s.summaryMinutes)
    .sort((a, b) => b.summaryMinutes - a.summaryMinutes)[0];
  if (!due) return null;
  return {
    shift: due,
    dateKey,
    shiftKey: `${dateKey}:${due.id}`,
    windowStart: dhakaInstant(dateKey, due.startMinutes),
    windowEnd: dhakaInstant(dateKey, due.endMinutes),
  };
}

export function shiftWindowLabel(at: Date = new Date()) {
  const shift = currentShift(at);
  if (shift) return { open: true as const, label: shift.label };
  return { open: false as const, label: "এখন আপডেট উইন্ডোর বাইরে (৯:০০–১২:৪৫ ও ২:০০–৫:২০)" };
}
