import { supabaseAdmin } from "@/integrations/supabase/client.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

function apiKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

export const AUDIO_BUCKET = "call-audio";

export async function transcribeAudio(bytes: Uint8Array, filename: string): Promise<string> {
  const form = new FormData();
  form.append("model", "google/gemini-3.5-transcribe");
  form.append("file", new Blob([bytes as BlobPart]), filename);

  const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`Transcription failed (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json()) as { text?: string };
  return json.text?.trim() ?? "";
}

export type CallAnalysis = {
  summary_bullets: string[];
  sentiment: "positive" | "neutral" | "negative" | "critical";
  objections: string[];
  deal_stage: string;
  timestamped_transcript: string;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary_bullets", "sentiment", "objections", "deal_stage", "timestamped_transcript"],
  properties: {
    summary_bullets: {
      type: "array",
      items: { type: "string" },
      description: "Exactly three short bullets summarising the call.",
    },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "critical"] },
    objections: { type: "array", items: { type: "string" } },
    deal_stage: { type: "string" },
    timestamped_transcript: {
      type: "string",
      description:
        "The transcript rewritten as lines of the form [MM:SS] Agent: text or [MM:SS] Customer: text",
    },
  },
} as const;

/** Runs the sales-call analysis on a raw transcript using Lovable AI. */
export async function analyzeTranscript(
  transcript: string,
  durationSeconds: number,
): Promise<CallAnalysis> {
  const res = await fetch(`${GATEWAY}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      input: [
        {
          role: "developer",
          content: [
            {
              type: "input_text",
              text: "You analyse tele-sales phone calls for a B2B sales team. Be concise and factual, never invent facts that are not in the transcript.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analyse this sales call (about ${durationSeconds} seconds long). Split the raw transcript into speaker lines with plausible [MM:SS] timestamps spread evenly across the call duration, labelling each line as Agent or Customer.\n\nRaw transcript:\n${transcript}`,
            },
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "call_analysis", strict: true, schema: ANALYSIS_SCHEMA },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Call analysis failed (${res.status}): ${await res.text().catch(() => "")}`);
  }

  const raw = await readSseText(res);
  const parsed = JSON.parse(raw) as CallAnalysis;
  return parsed;
}

async function readSseText(res: Response): Promise<string> {
  const body = res.body;
  if (!body) throw new Error("Empty analysis response");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        } else if (event.type === "response.completed" && event.response?.output_text) {
          if (!text) text = event.response.output_text;
        }
      } catch {
        // ignore keep-alive / partial frames
      }
    }
  }

  if (!text) throw new Error("Analysis returned no content");
  return text;
}

/** Transcribes + analyses a stored recording and writes the intelligence back to the row. */
export async function processRecording(recordingId: string): Promise<void> {
  const { data: recording, error } = await supabaseAdmin
    .from("call_recordings")
    .select("*")
    .eq("id", recordingId)
    .single();
  if (error || !recording) throw new Error(error?.message ?? "Recording not found");
  if (!recording.audio_url) throw new Error("Recording has no audio file");

  const { data: file, error: downloadError } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .download(recording.audio_url);
  if (downloadError || !file) throw new Error(downloadError?.message ?? "Audio download failed");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const filename = recording.audio_url.split("/").pop() ?? "recording.mp3";

  try {
    const transcript = await transcribeAudio(bytes, filename);
    if (!transcript) {
      await supabaseAdmin
        .from("call_recordings")
        .update({ sync_status: "failed" })
        .eq("id", recordingId);
      return;
    }

    const analysis = await analyzeTranscript(transcript, recording.duration_seconds);

    await supabaseAdmin
      .from("call_recordings")
      .update({
        transcription_text: analysis.timestamped_transcript || transcript,
        ai_summary: analysis.summary_bullets.map((b) => `• ${b}`).join("\n"),
        sentiment: analysis.sentiment,
        customer_objections: analysis.objections,
        deal_stage: analysis.deal_stage,
        sync_status: recording.is_two_sided ? "verified" : "uploaded",
      })
      .eq("id", recordingId);
  } catch (err) {
    await supabaseAdmin
      .from("call_recordings")
      .update({ sync_status: "failed" })
      .eq("id", recordingId);
    throw err;
  }
}

/** Stores an uploaded call, bumps the lead, and returns the new recording id. */
export async function ingestRecording(input: {
  leadId: string;
  agentId: string | null;
  audioBase64: string;
  fileExtension: string;
  durationSeconds: number;
  direction: "outgoing" | "incoming_callback";
  isTwoSided: boolean;
}): Promise<string> {
  const { data: lead, error: leadError } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", input.leadId)
    .single();
  if (leadError || !lead) throw new Error(leadError?.message ?? "Lead not found");

  const bytes = Uint8Array.from(atob(input.audioBase64), (c) => c.charCodeAt(0));
  const path = `uploads/${input.leadId}/${Date.now()}.${input.fileExtension}`;

  const { error: uploadError } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .upload(path, bytes, { contentType: mimeFor(input.fileExtension) });
  if (uploadError) throw new Error(uploadError.message);

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("call_recordings")
    .insert({
      lead_id: input.leadId,
      agent_id: input.agentId ?? lead.assigned_to,
      phone_number: lead.phone_number,
      call_direction: input.direction,
      duration_seconds: input.durationSeconds,
      audio_url: path,
      is_two_sided: input.isTwoSided,
      sync_status: "uploaded",
    })
    .select("id")
    .single();
  if (insertError || !inserted) throw new Error(insertError?.message ?? "Could not save recording");

  await supabaseAdmin
    .from("leads")
    .update({
      call_attempts: lead.call_attempts + 1,
      last_call_at: new Date().toISOString(),
      status: lead.status === "pending" ? "contacted" : lead.status,
      is_verified: lead.is_verified || input.isTwoSided,
    })
    .eq("id", input.leadId);

  return inserted.id;
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
}
