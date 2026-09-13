import { z } from "zod";

/**
 * One shared definition of what the Android client is allowed to post,
 * used by the ingest validation screen so IT can test a payload before
 * the phones go live.
 */

/** Bangladesh mobile numbers: 01XXXXXXXXX, +8801XXXXXXXXX or 8801XXXXXXXXX. */
export const BD_PHONE = /^(?:\+?880|0)1[3-9]\d{8}$/;

export const RecordingPayload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().regex(BD_PHONE, "Use a Bangladeshi mobile number").optional(),
  agent_id: z.string().uuid().nullable().optional(),
  audio_base64: z.string().min(1, "Recording audio is missing"),
  file_extension: z.enum(["mp3", "m4a", "aac", "wav", "ogg", "amr"]).default("mp3"),
  duration_seconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 4),
  call_direction: z.enum(["outgoing", "incoming_callback"]).default("outgoing"),
  is_two_sided: z.boolean().default(true),
});

export const MessagePayload = z.object({
  lead_id: z.string().uuid().optional(),
  phone_number: z.string().regex(BD_PHONE, "Use a Bangladeshi mobile number").optional(),
  agent_id: z.string().uuid().nullable().optional(),
  sender_type: z.enum(["agent", "customer"]),
  message_type: z.enum(["text", "voice_note", "image", "document"]).default("text"),
  message_content: z.string().max(4000).nullable().optional(),
  media_url: z.string().url().nullable().optional(),
  duration_seconds: z.number().int().min(0).nullable().optional(),
});

export const LeadPayload = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone_number: z.string().regex(BD_PHONE, "Use a Bangladeshi mobile number"),
  company: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(40).default("webhook"),
  assign: z.boolean().default(true),
});

export type IngestKind = "recording" | "message" | "lead";

export const INGEST_ENDPOINTS: {
  kind: IngestKind;
  path: string;
  label: string;
  what: string;
  sample: string;
}[] = [
  {
    kind: "recording",
    path: "/api/public/ingest/recording",
    label: "Call recording",
    what: "Call audio, then AI transcript + sentiment",
    sample: JSON.stringify(
      {
        phone_number: "01805049668",
        duration_seconds: 96,
        call_direction: "outgoing",
        is_two_sided: true,
        file_extension: "m4a",
        audio_base64: "<base64 audio>",
      },
      null,
      2,
    ),
  },
  {
    kind: "message",
    path: "/api/public/ingest/message",
    label: "WhatsApp log",
    what: "One WhatsApp message in the lead timeline",
    sample: JSON.stringify(
      {
        phone_number: "01805049668",
        sender_type: "agent",
        message_type: "text",
        message_content: "Sir, plot price list পাঠিয়ে দিলাম।",
      },
      null,
      2,
    ),
  },
  {
    kind: "lead",
    path: "/api/public/ingest/lead",
    label: "New lead",
    what: "Website / ad form lead, auto-assigned",
    sample: JSON.stringify(
      {
        name: "Rakib Hasan",
        phone_number: "01712345678",
        company: "Hasan Traders",
        source: "facebook_ads",
        assign: true,
      },
      null,
      2,
    ),
  },
];

export function schemaFor(kind: IngestKind) {
  if (kind === "recording") return RecordingPayload;
  if (kind === "message") return MessagePayload;
  return LeadPayload;
}

export type ValidationIssue = { field: string; message: string };

/** Validates a raw payload without touching the database. */
export function validatePayload(
  kind: IngestKind,
  payload: unknown,
): { ok: boolean; issues: ValidationIssue[]; normalized?: unknown } {
  const result = schemaFor(kind).safeParse(payload);
  if (result.success) {
    const data = result.data as Record<string, unknown>;
    const issues: ValidationIssue[] = [];
    if (kind !== "lead" && !data["lead_id"] && !data["phone_number"]) {
      issues.push({
        field: "phone_number",
        message: "Send either lead_id or phone_number so the log can find its lead",
      });
    }
    if (kind === "message" && !data["message_content"] && !data["media_url"]) {
      issues.push({
        field: "message_content",
        message: "Message text or a media link is required",
      });
    }
    return issues.length
      ? { ok: false, issues }
      : { ok: true, issues: [], normalized: result.data };
  }
  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "payload",
      message: issue.message,
    })),
  };
}
