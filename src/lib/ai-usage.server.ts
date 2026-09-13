import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * AI usage ledger — every paid AI call writes one row so the monthly credit
 * bill page can show real counts instead of guesses. Best-effort: a logging
 * failure must never break the feature that ran.
 */

export type AiUsageCategory =
  | "command_agent"
  | "transcription"
  | "analysis"
  | "doc_summary"
  | "other";

/** Flat per-call estimates in Lovable credits, agreed with the bill report. */
export const AI_USAGE_RATES: Record<AiUsageCategory, number> = {
  command_agent: 0.25,
  transcription: 0.02,
  analysis: 0.03,
  doc_summary: 0.03,
  other: 0.01,
};

export async function logAiUsage(input: {
  category: AiUsageCategory;
  model?: string | null;
  units?: number;
  actorProfileId?: string | null;
  detail?: string | null;
}): Promise<void> {
  try {
    await supabaseAdmin.from("ai_usage_events").insert({
      category: input.category,
      model: input.model ?? null,
      units: input.units ?? 1,
      est_credits: AI_USAGE_RATES[input.category] * (input.units ?? 1),
      actor_profile_id: input.actorProfileId ?? null,
      detail: input.detail ?? null,
    });
  } catch (err) {
    console.error("[ai-usage] log failed", err);
  }
}
