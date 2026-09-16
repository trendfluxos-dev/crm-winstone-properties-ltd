import { recordUsage, type UsageProvider } from "@/lib/billing-meter.server";

/**
 * Backwards-compatible wrapper around the metered ledger.
 *
 * Existing call sites keep calling `logAiUsage`; cost now comes from the
 * `provider_rate_cards` table instead of a hard-coded flat constant.
 */

export type AiUsageCategory =
  "command_agent" | "transcription" | "analysis" | "doc_summary" | "other";

export async function logAiUsage(input: {
  category: AiUsageCategory;
  model?: string | null;
  units?: number;
  actorProfileId?: string | null;
  detail?: string | null;
  provider?: UsageProvider;
  idempotencyKey?: string | null;
}): Promise<void> {
  await recordUsage({
    provider: input.provider ?? (input.category === "transcription" ? "sarvam" : "lovable-ai"),
    operation: input.category,
    category: input.category,
    model: input.model ?? null,
    units: input.units ?? 1,
    actorProfileId: input.actorProfileId ?? null,
    detail: input.detail ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });
}
