/**
 * Provider-agnostic speech-to-text adapter (server-only).
 *
 * Gemini (through the Lovable AI gateway) is the production provider today.
 * Sarvam Saaras is implemented but disabled by default, because Sarvam
 * currently answers Bangladesh-origin traffic with HTTP 403 GEO_BLOCKED.
 * Switching providers later is a configuration change only:
 *
 *   STT_PRIMARY_PROVIDER = gemini | sarvam   (default: gemini)
 *   STT_SARVAM_ENABLED   = true | false      (default: false)
 *
 * No API key ever leaves this runtime, and keys are never logged or stored.
 */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const GEMINI_STT_MODEL = "google/gemini-3.5-transcribe";

export type SttProviderName = "gemini" | "openai" | "sarvam";

/** Gateway-served models per provider; both work from Bangladesh. */
const GATEWAY_MODELS: Record<"gemini" | "openai", string> = {
  gemini: "google/gemini-3.5-transcribe",
  openai: "openai/gpt-4o-transcribe",
};

export type SttResult = {
  transcript: string;
  provider: SttProviderName;
  model: string;
  language: string | null;
  status: "completed" | "failed";
  requestId: string | null;
  durationMs: number;
  fallbackUsed: boolean;
  errorCode: string | null;
  errorMessage: string | null;
};

export type SttFailure = {
  code: string;
  /** Safe, non-technical message suitable for storing on the call record. */
  message: string;
  /** false for permanent conditions such as GEO_BLOCKED — never retry those. */
  retryable: boolean;
};

class SttProviderError extends Error {
  constructor(readonly failure: SttFailure) {
    super(failure.message);
    this.name = "SttProviderError";
  }
}

export function sttPrimaryProvider(): SttProviderName {
  return process.env["STT_PRIMARY_PROVIDER"] === "sarvam" && sarvamEnabled() ? "sarvam" : "gemini";
}

export function sarvamEnabled(): boolean {
  return process.env["STT_SARVAM_ENABLED"] === "true" && Boolean(process.env["SARVAM_API_KEY"]);
}

/* ------------------------------- Gemini ---------------------------------- */

async function transcribeWithGemini(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<{ transcript: string; model: string; requestId: string | null }> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) {
    throw new SttProviderError({
      code: "STT_NOT_CONFIGURED",
      message: "ট্রান্সক্রিপশন সেবা কনফিগার করা নেই",
      retryable: false,
    });
  }

  const form = new FormData();
  form.append("model", GEMINI_STT_MODEL);
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) {
    const retryable = res.status === 429 || res.status >= 500;
    throw new SttProviderError({
      code: `GEMINI_${res.status}`,
      message: retryable ? "ট্রান্সক্রিপশন সেবা ব্যস্ত, পরে আবার চেষ্টা হবে" : "অডিও ট্রান্সক্রাইব করা যায়নি",
      retryable,
    });
  }

  const json = (await res.json()) as { text?: string; request_id?: string };
  return {
    transcript: (json.text ?? "").trim(),
    model: GEMINI_STT_MODEL,
    requestId: json.request_id ?? null,
  };
}

/* ------------------------------- Sarvam ---------------------------------- */

async function transcribeWithSarvam(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<{ transcript: string; model: string; requestId: string | null; language: string | null }> {
  const { sarvamTranscribeDetailed, SarvamError } = await import("@/lib/sarvam-stt.server");

  try {
    const result = await sarvamTranscribeDetailed(bytes, filename, contentType);
    if (!result) {
      throw new SttProviderError({
        code: "SARVAM_NOT_CONFIGURED",
        message: "Sarvam কনফিগার করা নেই",
        retryable: false,
      });
    }
    return {
      transcript: result.transcript,
      model: result.model,
      requestId: result.requestId,
      language: result.language,
    };
  } catch (error) {
    if (error instanceof SttProviderError) throw error;
    if (error instanceof SarvamError) {
      // Bangladesh-origin traffic is currently region-blocked: permanent, never retry.
      const geoBlocked = error.status === 403;
      throw new SttProviderError({
        code: geoBlocked ? "GEO_BLOCKED" : `SARVAM_${error.status}`,
        message: geoBlocked
          ? "Sarvam এই অঞ্চলে এখন ব্যবহারযোগ্য নয়"
          : "Sarvam ট্রান্সক্রিপশন ব্যর্থ হয়েছে",
        retryable: !geoBlocked && error.status !== 401,
      });
    }
    throw new SttProviderError({
      code: "SARVAM_ERROR",
      message: "Sarvam ট্রান্সক্রিপশন ব্যর্থ হয়েছে",
      retryable: true,
    });
  }
}

/* ------------------------------- Adapter --------------------------------- */

/**
 * Transcribes call audio through the configured provider, falling back to the
 * other provider when the first one fails in a way a retry cannot fix.
 */
export async function transcribeWithAdapter(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<SttResult> {
  const primary = sttPrimaryProvider();
  const order: SttProviderName[] =
    primary === "sarvam" ? ["sarvam", "gemini"] : sarvamEnabled() ? ["gemini", "sarvam"] : ["gemini"];

  const startedAt = Date.now();
  let lastFailure: SttFailure = {
    code: "STT_UNAVAILABLE",
    message: "ট্রান্সক্রিপশন করা যায়নি",
    retryable: true,
  };

  for (let i = 0; i < order.length; i += 1) {
    const provider = order[i]!;
    try {
      const out =
        provider === "sarvam"
          ? await transcribeWithSarvam(bytes, filename, contentType)
          : { ...(await transcribeWithGemini(bytes, filename, contentType)), language: null };

      return {
        transcript: out.transcript,
        provider,
        model: out.model,
        language: "language" in out ? (out.language ?? null) : null,
        status: "completed",
        requestId: out.requestId,
        durationMs: Date.now() - startedAt,
        fallbackUsed: i > 0,
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      lastFailure =
        error instanceof SttProviderError
          ? error.failure
          : { code: "STT_ERROR", message: "ট্রান্সক্রিপশন ব্যর্থ হয়েছে", retryable: true };
      // Safe diagnostics only — never any credential material.
      console.warn(`STT provider ${provider} failed: ${lastFailure.code}`);
    }
  }

  return {
    transcript: "",
    provider: order[0]!,
    model: order[0] === "sarvam" ? (process.env["SARVAM_STT_MODEL"] ?? "saaras:v4") : GEMINI_STT_MODEL,
    language: null,
    status: "failed",
    requestId: null,
    durationMs: Date.now() - startedAt,
    fallbackUsed: order.length > 1,
    errorCode: lastFailure.code,
    errorMessage: lastFailure.message,
  };
}
