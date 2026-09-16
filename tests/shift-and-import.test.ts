import { describe, expect, it } from "vitest";

import {
  currentShift,
  dhakaInstant,
  dhakaParts,
  shiftDueForSummary,
  SHIFTS,
} from "@/lib/shift.server";
import { parseCsv, toLeadRows } from "@/lib/csv-leads";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import {
  dhakaDayKey,
  dhakaMonthBounds,
  dhakaMonthDays,
  dhakaMonthKey,
  previousDhakaMonth,
} from "@/lib/dhaka-time";

const dhaka = (dateKey: string, minutes: number) => dhakaInstant(dateKey, minutes);

describe("Dhaka shift windows", () => {
  it("keeps exactly the two agreed shifts (no midday slot)", () => {
    expect(SHIFTS.map((s) => s.id)).toEqual(["morning", "evening"]);
    expect(SHIFTS.map((s) => s.summaryMinutes)).toEqual([12 * 60 + 50, 17 * 60 + 30]);
  });

  it("carries work done after 5:20 pm into the next 12:50 summary window", () => {
    const morning = SHIFTS[0]!;
    // Window starts the previous day at 17:20, so after-hours updates are counted.
    expect(morning.windowStartMinutes).toBe(17 * 60 + 20 - 24 * 60);
    const start = dhakaInstant("2026-09-14", morning.windowStartMinutes);
    expect(dhakaParts(start).dateKey).toBe("2026-09-13");
    expect(dhakaParts(start).minutes).toBe(17 * 60 + 20);
    // The two windows meet without a gap or an overlap.
    expect(SHIFTS[1]!.windowStartMinutes).toBe(morning.endMinutes);
  });

  it("reports the summary window from the carry-over start", () => {
    const due = shiftDueForSummary(dhaka("2026-09-14", 12 * 60 + 50));
    expect(dhakaParts(due!.windowStart).dateKey).toBe("2026-09-13");
  });

  it("converts Dhaka wall clock to UTC and back", () => {
    const at = dhaka("2026-09-13", 10 * 60);
    expect(dhakaParts(at).minutes).toBe(600);
    expect(dhakaParts(at).dateKey).toBe("2026-09-13");
  });

  it("knows when an agent is inside a shift", () => {
    expect(currentShift(dhaka("2026-09-13", 10 * 60))?.id).toBe("morning");
    expect(currentShift(dhaka("2026-09-13", 13 * 60))).toBeNull();
    expect(currentShift(dhaka("2026-09-13", 15 * 60))?.id).toBe("evening");
    expect(currentShift(dhaka("2026-09-13", 22 * 60))).toBeNull();
  });

  it("only reports a summary as due after its window closed", () => {
    expect(shiftDueForSummary(dhaka("2026-09-13", 12 * 60 + 30))).toBeNull();
    expect(shiftDueForSummary(dhaka("2026-09-13", 12 * 60 + 50))?.shift.id).toBe("morning");
    expect(shiftDueForSummary(dhaka("2026-09-13", 17 * 60 + 35))?.shift.id).toBe("evening");
  });
});

describe("lead import parsing", () => {
  it("honours RFC-4180 quoting and embedded commas", () => {
    const grid = parseCsv('name,phone,company\n"Rahim, Md.",01712345678,"Winstone, Ltd"\n');
    expect(grid[1]).toEqual(["Rahim, Md.", "01712345678", "Winstone, Ltd"]);
  });

  it("maps headers to lead rows and drops rows without a phone", () => {
    const rows = toLeadRows(parseCsv("name,phone\nRahim,01712345678\nNoPhone,\n"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.phone_number).toContain("1712345678");
    expect(rows[0]?.name).toBe("Rahim");
  });
});

describe("WhatsApp number handling", () => {
  it("normalises to an msisdn or refuses", () => {
    expect(normalizeWhatsAppNumber("01712345678")).toBe("8801712345678");
    expect(normalizeWhatsAppNumber("+8801712345678")).toBe("8801712345678");
    expect(normalizeWhatsAppNumber("123")).toBeNull();
    expect(normalizeWhatsAppNumber(null)).toBeNull();
  });
});

describe("Dhaka billing boundaries", () => {
  it("buckets an instant into the Dhaka calendar day, not the UTC day", () => {
    // 18:30 UTC on 31 Jan is already 00:30 on 1 Feb in Dhaka.
    expect(dhakaDayKey("2026-01-31T18:30:00.000Z")).toBe("2026-02-01");
    expect(dhakaDayKey("2026-01-31T17:30:00.000Z")).toBe("2026-01-31");
    expect(dhakaMonthKey("2026-01-31T18:30:00.000Z")).toBe("2026-02");
  });

  it("returns month bounds that start and end at midnight Dhaka time", () => {
    const { start, end } = dhakaMonthBounds("2026-02");
    expect(start).toBe("2026-01-31T18:00:00.000Z");
    expect(end).toBe("2026-02-28T18:00:00.000Z");
    // Bounds are contiguous: the end of one month is the start of the next.
    expect(dhakaMonthBounds("2026-03").start).toBe(end);
  });

  it("knows month lengths and the previous month across a year boundary", () => {
    expect(dhakaMonthDays("2026-02")).toBe(28);
    expect(dhakaMonthDays("2028-02")).toBe(29);
    expect(dhakaMonthDays("2026-12")).toBe(31);
    expect(previousDhakaMonth("2026-01")).toBe("2025-12");
  });
});
