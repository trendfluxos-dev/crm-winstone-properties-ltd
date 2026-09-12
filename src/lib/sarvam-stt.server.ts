/**
 * Bangla speech-to-text through Sarvam AI (Saaras).
 *
 * Server-only: the subscription key never leaves this runtime and is never
 * logged. When the key is not configured, or when Sarvam rejects the audio,
 * the caller falls back to the built-in transcription model so the call
 * pipeline keeps working either way.
 */

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

/** Saaras v4 is the newest model; v3 stays available through SARVAM_STT_MODEL. */
const DEFAULT_MODEL = "saaras:v4";
/** transcribe keeps Bangla as Bangla; codemix suits heavily mixed Bangla+English calls. */
const DEFAULT_MODE = "transcribe";

export function sarvamConfigured(): boolean {
  return Boolean(process.env["SARVAM_API_KEY"]);
}

export type SarvamResult = {
  transcript: string;
  provider: "sarvam";
  model: string;
  mode: string;
  requestId: string | null;
  language: string | null;
};

/** Sarvam failures we can describe safely, without leaking credentials. */
export class SarvamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** true when falling back to the built-in model is the right move. */
    readonly recoverable: boolean,
  ) {
    super(message);
    this.name = "SarvamError";
  }
}

function describe(status: number): { message: string; recoverable: boolean } {
  if (status === 401 || status === 403) {
    return { message: "Sarvam key rejected (authentication failed)", recoverable: true };
  }
  if (status === 400 || status === 413 || status === 422) {
    return { message: "Sarvam rejected the audio (invalid or too long for sync STT)", recoverable: true };
  }
  if (status === 429) return { message: "Sarvam rate limit reached", recoverable: true };
  if (status >= 500) return { message: "Sarvam service error", recoverable: true };
  return { message: `Sarvam transcription failed (${status})`, recoverable: true };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Transcribes a call recording in Bangla. Returns null when Sarvam is not
 * configured so the caller can use its fallback. Retries 429/5xx with backoff.
 */
export async function sarvamTranscribeDetailed(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<SarvamResult | null> {
  const key = process.env["SARVAM_API_KEY"];
  if (!key) return null;

  const model = process.env["SARVAM_STT_MODEL"] ?? DEFAULT_MODEL;
  const mode = process.env["SARVAM_STT_MODE"] ?? DEFAULT_MODE;

  let lastError: SarvamError | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
    form.append("model", model);
    form.append("language_code", "bn-IN");
    // Saaras accepts a mode; older Saarika models ignore the extra field.
    if (model.startsWith("saaras")) form.append("mode", mode);

    // No client-side deadline: long calls legitimately take minutes.
    const res = await fetch(SARVAM_STT_URL, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
    });

    if (res.ok) {
      const json = (await res.json()) as {
        transcript?: string;
        text?: string;
        request_id?: string;
        language_code?: string;
      };
      return {
        transcript: (json.transcript ?? json.text ?? "").trim(),
        provider: "sarvam",
        model,
        mode,
        requestId: json.request_id ?? null,
        language: json.language_code ?? "bn-IN",
      };
    }

    const { message, recoverable } = describe(res.status);
    lastError = new SarvamError(message, res.status, recoverable);

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable) break;
    await sleep(1000 * 2 ** attempt);
  }

  throw lastError ?? new SarvamError("Sarvam transcription failed", 0, true);
}

/** Backwards-compatible helper: transcript text only. */
export async function sarvamTranscribe(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<string | null> {
  const result = await sarvamTranscribeDetailed(bytes, filename, contentType);
  return result ? result.transcript : null;
}
