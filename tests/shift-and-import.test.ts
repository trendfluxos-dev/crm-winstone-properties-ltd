import { describe, expect, it } from "vitest";

import { currentShift, dhakaInstant, dhakaParts, shiftDueForSummary, SHIFTS } from "@/lib/shift.server";
import { parseCsv, toLeadRows } from "@/lib/csv-leads";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { AI_USAGE_RATES } from "@/lib/credits-rates";

const dhaka = (dateKey: string, minutes: number) => dhakaInstant(dateKey, minutes);

describe("Dhaka shift windows", () => {
  it("keeps exactly the two agreed shifts (no midday slot)", () => {
    expect(SHIFTS.map((s) => s.id)).toEqual(["morning", "evening"]);
    expect(SHIFTS.map((s) => s.summaryMinutes)).toEqual([12 * 60 + 50, 17 * 60 + 30]);
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

describe("credit rates", () => {
  it("exposes the same rates the billing page quotes", () => {
    expect(AI_USAGE_RATES.command_agent).toBe(0.25);
    expect(AI_USAGE_RATES.transcription).toBeLessThan(AI_USAGE_RATES.command_agent);
  });
});
