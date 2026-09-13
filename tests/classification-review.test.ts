import { describe, expect, it } from "vitest";

import { classificationMismatch } from "@/lib/classification-review";

describe("AI vs agent classification review", () => {
  it("stays silent when both agree", () => {
    expect(
      classificationMismatch({
        aiTemperature: "hot",
        aiGrade: "A",
        humanTemperature: "hot",
        humanGrade: "A",
      }),
    ).toBeNull();
  });

  it("stays silent when the AI has no opinion", () => {
    expect(
      classificationMismatch({
        aiTemperature: null,
        aiGrade: null,
        humanTemperature: "cold",
        humanGrade: "D",
      }),
    ).toBeNull();
  });

  it("stays silent when the agent has not classified yet", () => {
    expect(
      classificationMismatch({
        aiTemperature: "hot",
        aiGrade: "A",
        humanTemperature: null,
        humanGrade: null,
      }),
    ).toBeNull();
  });

  it("flags a one-step temperature disagreement as info", () => {
    const result = classificationMismatch({
      aiTemperature: "hot",
      aiGrade: "B",
      humanTemperature: "warm",
      humanGrade: "B",
    });
    expect(result?.fields).toEqual(["temperature"]);
    expect(result?.severity).toBe("info");
  });

  it("flags hot-vs-cold as warning or worse", () => {
    const result = classificationMismatch({
      aiTemperature: "hot",
      aiGrade: "A",
      humanTemperature: "cold",
      humanGrade: "A",
    });
    expect(result?.distance).toBe(2);
    expect(result?.severity).toBe("warning");
  });

  it("flags A-vs-D grade gap as critical", () => {
    const result = classificationMismatch({
      aiTemperature: "hot",
      aiGrade: "A",
      humanTemperature: "hot",
      humanGrade: "D",
    });
    expect(result?.fields).toEqual(["grade"]);
    expect(result?.severity).toBe("critical");
  });

  it("reports both fields when both disagree", () => {
    const result = classificationMismatch({
      aiTemperature: "hot",
      aiGrade: "A",
      humanTemperature: "cold",
      humanGrade: "C",
    });
    expect(result?.fields).toEqual(["temperature", "grade"]);
    expect(result?.severity).toBe("critical");
    expect(result?.detail).toContain("গ্রেড");
  });
});
