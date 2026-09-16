import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TranscribeInput = z.object({
  /** WAV audio bytes, base64 encoded. */
  audioBase64: z.string().min(64),
  /** BCP-47 language hint; defaults to Bengali broadly. */
  language: z.string().max(10).default("bn"),
});

/**
 * Transcribe a short WAV audio chunk using the Lovable AI speech-to-text gateway.
 *
 * This is a server function (the modern TanStack equivalent of an Edge Function)
 * so the API key never reaches the browser.
 */
export const transcribeAudio = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => TranscribeInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("STT gateway not configured");

    const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength < 2048) throw new Error("Recording too short — please speak again");
    if (bytes.byteLength > 14 * 1024 * 1024)
      throw new Error("Recording too long — split into smaller clips");

    const blob = new Blob([bytes], { type: "audio/wav" });
    const form = new FormData();
    form.append("file", blob, "chunk.wav");
    form.append("model", "google/gemini-3.5-transcribe");
    form.append("response_format", "json");
    if (data.language) form.append("language", data.language);

    const response = await (await import("@/lib/metered-fetch.server")).meteredFetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    }, { provider: "lovable-ai", operation: "transcription", category: "transcription" });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 429) throw new Error("Too many transcription requests — please wait");
      if (response.status === 402) throw new Error("AI credit exhausted — ask the owner to top up");
      if (response.status === 403) throw new Error("Transcription blocked by workspace policy");
      if (response.status === 400) throw new Error(`Invalid audio: ${detail.slice(0, 160)}`);
      throw new Error(`Transcription failed (${response.status}): ${detail.slice(0, 160)}`);
    }

    const payload = (await response.json()) as { text?: string };
    return { text: payload.text?.trim() ?? "" };
  });
