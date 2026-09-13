import { describe, expect, it } from "vitest";

import { LEAD_GRADES, LEAD_TEMPERATURES, validateReport } from "@/lib/call-reports.server";

const base = {
  category: "interested",
  summary: "গ্রাহক দাম জানতে চেয়েছেন",
  note: "আগামীকাল কোটেশন পাঠাতে হবে",
  followUpAt: "2026-09-14T10:00:00.000Z",
};

describe("post-call report rules", () => {
  it("rejects an unknown category", () => {
    expect(
      validateReport({ ...base, category: "nonsense", temperature: "hot", grade: "A" })?.field,
    ).toBe("category");
  });

  it("requires a summary and a note, but not a follow-up", () => {
    expect(validateReport({ ...base, summary: "", temperature: "hot", grade: "A" })?.field).toBe(
      "summary",
    );
    expect(validateReport({ ...base, note: "", temperature: "hot", grade: "A" })?.field).toBe(
      "note",
    );
    expect(
      validateReport({ ...base, followUpAt: null, temperature: "hot", grade: "A" }),
    ).toBeNull();
  });


  it("requires a reason for not_interested and wrong_number", () => {
    expect(
      validateReport({ ...base, category: "not_interested", temperature: "cold", grade: "D" })
        ?.field,
    ).toBe("reason");
    expect(
      validateReport({
        ...base,
        category: "wrong_number",
        reason: "নম্বর ভুল",
        temperature: "cold",
        grade: "D",
      }),
    ).toBeNull();
  });

  it("forces classification on a received call", () => {
    expect(validateReport({ ...base, connected: true })?.field).toBe("temperature");
    expect(validateReport({ ...base, connected: true, temperature: "hot" })?.field).toBe("grade");
    expect(validateReport({ ...base, connected: true, temperature: "hot", grade: "A" })).toBeNull();
  });

  it("does not force classification when the call was never received", () => {
    expect(validateReport({ ...base, category: "no_answer", connected: false })).toBeNull();
  });

  it("rejects classification values outside the allowed sets", () => {
    expect(
      validateReport({ ...base, connected: true, temperature: "lukewarm", grade: "A" })?.field,
    ).toBe("temperature");
    expect(
      validateReport({ ...base, connected: true, temperature: "hot", grade: "F" })?.field,
    ).toBe("grade");
    expect(LEAD_TEMPERATURES).toEqual(["hot", "warm", "cold"]);
    expect(LEAD_GRADES).toEqual(["A", "B", "C", "D"]);
  });
});
