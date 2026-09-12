/**
 * Bangla speech-to-text through Sarvam AI.
 *
 * Server-only: the subscription key never leaves this runtime. When the key is
 * not configured the caller falls back to the built-in transcription model, so
 * the call pipeline keeps working either way.
 */

const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

export function sarvamConfigured(): boolean {
  return Boolean(process.env["SARVAM_API_KEY"]);
}

/**
 * Transcribes a call recording in Bangla. Returns the transcript text, or null
 * when Sarvam is not configured so the caller can use its fallback.
 */
export async function sarvamTranscribe(
  bytes: Uint8Array,
  filename: string,
  contentType: string,
): Promise<string | null> {
  const key = process.env["SARVAM_API_KEY"];
  if (!key) return null;

  const form = new FormData();
  form.append("file", new Blob([bytes as BlobPart], { type: contentType }), filename);
  form.append("model", process.env["SARVAM_STT_MODEL"] ?? "saarika:v2.5");
  form.append("language_code", "bn-IN");

  // No client-side deadline: long calls legitimately take minutes to transcribe.
  const res = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": key },
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Sarvam transcription failed (${res.status}): ${detail}`);
  }

  const json = (await res.json()) as { transcript?: string; text?: string };
  return (json.transcript ?? json.text ?? "").trim();
}
