/**
 * AI suggestion vs human classification review (pure logic, no I/O).
 *
 * The agent's manual Hot/Warm/Cold + A–D decision is final and is never
 * overwritten by AI. When the AI analysis of the same call disagreed, we raise
 * an immutable review alert for IT / Higher Authority instead of silently
 * changing anything.
 */

export const TEMPERATURE_ORDER = ["cold", "warm", "hot"] as const;
export const GRADE_ORDER = ["D", "C", "B", "A"] as const;

export type MismatchInput = {
  aiTemperature?: string | null;
  aiGrade?: string | null;
  humanTemperature?: string | null;
  humanGrade?: string | null;
};

export type MismatchResult = {
  fields: Array<"temperature" | "grade">;
  /** Largest single-step distance between the two opinions. */
  distance: number;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
};

function index<T extends readonly string[]>(order: T, value: string | null | undefined) {
  const at = order.indexOf((value ?? "") as T[number]);
  return at === -1 ? null : at;
}

/**
 * Returns null when there is nothing to review: no AI opinion, no human
 * decision, or both agree. Otherwise describes the disagreement.
 */
export function classificationMismatch(input: MismatchInput): MismatchResult | null {
  const fields: MismatchResult["fields"] = [];
  let distance = 0;

  const aiTemp = index(TEMPERATURE_ORDER, input.aiTemperature);
  const humanTemp = index(TEMPERATURE_ORDER, input.humanTemperature);
  if (aiTemp !== null && humanTemp !== null && aiTemp !== humanTemp) {
    fields.push("temperature");
    distance = Math.max(distance, Math.abs(aiTemp - humanTemp));
  }

  const aiGrade = index(GRADE_ORDER, input.aiGrade);
  const humanGrade = index(GRADE_ORDER, input.humanGrade);
  if (aiGrade !== null && humanGrade !== null && aiGrade !== humanGrade) {
    fields.push("grade");
    distance = Math.max(distance, Math.abs(aiGrade - humanGrade));
  }

  if (fields.length === 0) return null;

  const severity: MismatchResult["severity"] =
    distance >= 3 || (fields.length === 2 && distance >= 2)
      ? "critical"
      : distance >= 2
        ? "warning"
        : "info";

  const parts: string[] = [];
  if (fields.includes("temperature")) {
    parts.push(`তাপমাত্রা: এআই ${input.aiTemperature} · এজেন্ট ${input.humanTemperature}`);
  }
  if (fields.includes("grade")) {
    parts.push(`গ্রেড: এআই ${input.aiGrade} · এজেন্ট ${input.humanGrade}`);
  }

  return {
    fields,
    distance,
    severity,
    title: "এআই ও এজেন্টের শ্রেণিবিন্যাস মিলছে না",
    detail: parts.join(" | "),
  };
}
