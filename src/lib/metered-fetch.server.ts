import { recordUsage, type UsageProvider } from "@/lib/billing-meter.server";

/**
 * Drop-in `fetch` replacement for paid provider endpoints.
 *
 * It times the request, reads token usage from the cloned response body when
 * the provider reports it, and writes one priced ledger row. The original
 * response is returned untouched, so callers are unaffected and a metering
 * failure can never break the feature.
 */
export async function meteredFetch(
  url: string,
  init: RequestInit,
  meta: {
    provider: UsageProvider;
    operation: string;
    category?: string;
    model?: string | null;
    actorProfileId?: string | null;
    detail?: string | null;
    idempotencyKey?: string | null;
    /** Billable seconds for audio operations, when known up front. */
    seconds?: number | null;
  },
): Promise<Response> {
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    void recordUsage({
      provider: meta.provider,
      operation: meta.operation,
      ...(meta.category ? { category: meta.category } : {}),
      model: meta.model ?? null,
      status: "error",
      latencyMs: Date.now() - started,
      actorProfileId: meta.actorProfileId ?? null,
      detail: meta.detail ?? "network error",
      idempotencyKey: meta.idempotencyKey ?? null,
    });
    throw err;
  }

  const latencyMs = Date.now() - started;
  let inputUnits = 0;
  let outputUnits = 0;
  let model = meta.model ?? null;

  if (response.ok) {
    try {
      const peek = (await response.clone().json()) as {
        usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number };
        model?: string;
      };
      inputUnits = peek.usage?.prompt_tokens ?? peek.usage?.input_tokens ?? 0;
      outputUnits = peek.usage?.completion_tokens ?? peek.usage?.output_tokens ?? 0;
      if (peek.model) model = peek.model;
    } catch {
      // Non-JSON or streamed body: fall back to per-call pricing.
    }
  }

  void recordUsage({
    provider: meta.provider,
    operation: meta.operation,
    ...(meta.category ? { category: meta.category } : {}),
    ...(meta.seconds ? { units: meta.seconds, unitKind: "second" as const } : {}),
    model,
    inputUnits,
    outputUnits,
    actorProfileId: meta.actorProfileId ?? null,
    detail: meta.detail ?? null,
    status: response.ok ? "ok" : "error",
    latencyMs,
    idempotencyKey: meta.idempotencyKey ?? null,
  });

  return response;
}
