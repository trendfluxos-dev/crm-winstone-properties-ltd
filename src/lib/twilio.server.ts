/**
 * Twilio cloud-voice integration (server only).
 *
 * Treats Twilio calls as a separate call_source from Android SIM calls. All
 * credentials and webhook signature validation stay server-side.
 */

import { createHmac, timingSafeEqual } from "crypto";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

export type TwilioConfig = {
  apiKey: string | null;
  accountSid: string | null;
  authToken: string | null;
  phoneNumber: string | null;
  webhookBase: string;
  recordingConsentNotice: string | null;
  recordingEnabled: boolean;
};

export function twilioConfig(): TwilioConfig {
  const notice = process.env["TWILIO_RECORDING_CONSENT_NOTICE"] ?? null;
  // Empty string or "off" disables recording.
  const recordingEnabled = !!notice && notice.toLowerCase() !== "off";
  return {
    apiKey: process.env["TWILIO_API_KEY"] ?? null,
    accountSid: process.env["TWILIO_ACCOUNT_SID"] ?? null,
    authToken: process.env["TWILIO_AUTH_TOKEN"] ?? null,
    phoneNumber: process.env["TWILIO_PHONE_NUMBER"] ?? null,
    webhookBase: process.env["TWILIO_WEBHOOK_BASE_URL"]?.replace(/\/$/, "") ?? "",
    recordingConsentNotice: recordingEnabled ? notice : null,
    recordingEnabled,
  };
}

export function isConfigured(cfg = twilioConfig()): boolean {
  return !!(cfg.apiKey && cfg.accountSid && cfg.authToken && cfg.phoneNumber && cfg.webhookBase);
}

export function gatewayHeaders(cfg = twilioConfig()) {
  const key = cfg.apiKey ?? process.env["TWILIO_API_KEY"];
  const lovable = process.env["LOVABLE_API_KEY"];
  if (!key || !lovable) throw new Error("Twilio gateway credentials are not configured");
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": key,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function twilioFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${GATEWAY}${path.startsWith("/") ? path : `/${path}`}`;
  return fetch(url, { ...init, headers: { ...gatewayHeaders(), ...init?.headers } });
}

export type TwilioNumber = {
  sid: string;
  phoneNumber: string;
  friendlyName: string | null;
  voiceUrl: string | null;
  statusCallback: string | null;
  smsUrl: string | null;
  capabilities: { voice?: boolean; sms?: boolean; mms?: boolean };
};

/** Live list of the account's phone numbers, straight from Twilio. */
export async function listIncomingNumbers(): Promise<TwilioNumber[]> {
  const res = await twilioFetch("/IncomingPhoneNumbers.json?PageSize=50");
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) throw new Error(`Twilio number list failed (${res.status}): ${json["message"] ?? text}`);
  const rows = (json["incoming_phone_numbers"] as Array<Record<string, unknown>>) ?? [];
  return rows.map((row) => ({
    sid: String(row["sid"] ?? ""),
    phoneNumber: String(row["phone_number"] ?? ""),
    friendlyName: (row["friendly_name"] as string) ?? null,
    voiceUrl: (row["voice_url"] as string) ?? null,
    statusCallback: (row["status_callback"] as string) ?? null,
    smsUrl: (row["sms_url"] as string) ?? null,
    capabilities: (row["capabilities"] as { voice?: boolean; sms?: boolean; mms?: boolean }) ?? {},
  }));
}

/** Points a number's voice/SMS/status webhooks at this CRM. */
export async function updateNumberWebhooks(input: {
  sid: string;
  voiceUrl: string;
  statusCallback: string;
  smsUrl: string;
}): Promise<TwilioNumber> {
  const params = new URLSearchParams({
    VoiceUrl: input.voiceUrl,
    VoiceMethod: "POST",
    StatusCallback: input.statusCallback,
    StatusCallbackMethod: "POST",
    SmsUrl: input.smsUrl,
    SmsMethod: "POST",
  });
  const res = await twilioFetch(`/IncomingPhoneNumbers/${input.sid}.json`, {
    method: "POST",
    body: params.toString(),
  });
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) throw new Error(`Twilio webhook update failed (${res.status}): ${json["message"] ?? text}`);
  return {
    sid: String(json["sid"] ?? input.sid),
    phoneNumber: String(json["phone_number"] ?? ""),
    friendlyName: (json["friendly_name"] as string) ?? null,
    voiceUrl: (json["voice_url"] as string) ?? null,
    statusCallback: (json["status_callback"] as string) ?? null,
    smsUrl: (json["sms_url"] as string) ?? null,
    capabilities: (json["capabilities"] as { voice?: boolean; sms?: boolean }) ?? {},
  };
}

/** Search purchasable numbers in a country (default US, cheapest voice+SMS). */
export async function searchAvailableNumbers(country = "US"): Promise<
  Array<{ phoneNumber: string; friendlyName: string; locality: string | null }>
> {
  const res = await twilioFetch(
    `/AvailablePhoneNumbers/${encodeURIComponent(country)}/Local.json?VoiceEnabled=true&SmsEnabled=true&PageSize=10`,
  );
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) throw new Error(`Twilio number search failed (${res.status}): ${json["message"] ?? text}`);
  const rows = (json["available_phone_numbers"] as Array<Record<string, unknown>>) ?? [];
  return rows.map((row) => ({
    phoneNumber: String(row["phone_number"] ?? ""),
    friendlyName: String(row["friendly_name"] ?? row["phone_number"] ?? ""),
    locality: (row["locality"] as string) ?? null,
  }));
}

/** Buys a number and wires its webhooks in one step. Costs real money. */
export async function purchaseNumber(input: {
  phoneNumber: string;
  voiceUrl: string;
  statusCallback: string;
  smsUrl: string;
}): Promise<TwilioNumber> {
  const params = new URLSearchParams({
    PhoneNumber: input.phoneNumber,
    VoiceUrl: input.voiceUrl,
    VoiceMethod: "POST",
    StatusCallback: input.statusCallback,
    StatusCallbackMethod: "POST",
    SmsUrl: input.smsUrl,
    SmsMethod: "POST",
  });
  const res = await twilioFetch("/IncomingPhoneNumbers.json", {
    method: "POST",
    body: params.toString(),
  });
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) throw new Error(`Twilio number purchase failed (${res.status}): ${json["message"] ?? text}`);
  return {
    sid: String(json["sid"] ?? ""),
    phoneNumber: String(json["phone_number"] ?? input.phoneNumber),
    friendlyName: (json["friendly_name"] as string) ?? null,
    voiceUrl: (json["voice_url"] as string) ?? null,
    statusCallback: (json["status_callback"] as string) ?? null,
    smsUrl: (json["sms_url"] as string) ?? null,
    capabilities: (json["capabilities"] as { voice?: boolean; sms?: boolean }) ?? {},
  };
}

/** Sends an SMS through Twilio; returns the provider's own message state. */
export async function sendSms(input: {
  to: string;
  body: string;
  statusCallback?: string;
}): Promise<{ sid: string; status: string }> {
  const cfg = twilioConfig();
  const from = cfg.phoneNumber ?? (await resolvePhoneNumber(cfg));
  if (!from) throw new Error("No Twilio phone number is configured");
  const params = new URLSearchParams({ To: input.to, From: from, Body: input.body });
  if (input.statusCallback) params.set("StatusCallback", input.statusCallback);
  const res = await twilioFetch("/Messages.json", { method: "POST", body: params.toString() });
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) throw new Error(`Twilio SMS failed (${res.status}): ${json["message"] ?? text}`);
  return { sid: String(json["sid"] ?? ""), status: String(json["status"] ?? "queued") };
}

/** Fetch the first active incoming phone number if TWILIO_PHONE_NUMBER is not set. */
export async function resolvePhoneNumber(cfg = twilioConfig()): Promise<string | null> {
  if (cfg.phoneNumber) return cfg.phoneNumber;
  const res = await twilioFetch("/IncomingPhoneNumbers.json");
  if (!res.ok) return null;
  const json = (await res.json()) as { incoming_phone_numbers?: Array<{ phone_number?: string }> };
  return json.incoming_phone_numbers?.[0]?.phone_number ?? null;
}

export async function createOutboundCall(input: {
  agentPhone: string;
  customerPhone: string;
  leadId: string;
  agentId: string;
  record?: boolean;
}) {
  const cfg = twilioConfig();
  const from = cfg.phoneNumber ?? (await resolvePhoneNumber(cfg));
  if (!cfg.webhookBase) throw new Error("TWILIO_WEBHOOK_BASE_URL is not configured");
  if (!from) throw new Error("No Twilio phone number is configured");

  const bridgeUrl = new URL(`${cfg.webhookBase}/api/public/twilio/bridge`);
  bridgeUrl.searchParams.set("leadId", input.leadId);
  bridgeUrl.searchParams.set("agentId", input.agentId);
  bridgeUrl.searchParams.set("customerPhone", input.customerPhone);
  bridgeUrl.searchParams.set("record", String(input.record !== false));

  const statusUrl = `${cfg.webhookBase}/api/public/twilio/call-status`;
  const recordingUrl = `${cfg.webhookBase}/api/public/twilio/recording`;

  const params = new URLSearchParams({
    From: from,
    To: input.agentPhone,
    Url: bridgeUrl.toString(),
    StatusCallback: statusUrl,
    StatusCallbackEvent: "initiated ringing answered completed",
    StatusCallbackMethod: "POST",
  });

  const res = await twilioFetch("/Calls.json", { method: "POST", body: params.toString() });
  const text = await res.text();
  const json = parseTwilioResponse(text);
  if (!res.ok) {
    throw new Error(`Twilio call failed (${res.status}): ${json["message"] ?? text}`);
  }
  return {
    callSid: json["sid"] as string,
    status: json["status"] as string,
    to: json["to"] as string,
    from: json["from"] as string,
  };
}

/** Builds the second-leg TwiML: connect the answered agent to the customer and record. */
export function buildBridgeTwiML(input: {
  customerPhone: string;
  record: boolean;
  recordingStatusCallback: string;
  consentNotice: string | null;
}): string {
  const recordAttr = input.record ? ' record="record-from-answer-dual"' : "";
  const recordingCallback = input.record ? ` recordingStatusCallback="${escapeXml(input.recordingStatusCallback)}" recordingStatusCallbackEvent="completed failed"` : "";
  const say = input.consentNotice
    ? `<Say voice="alice">${escapeXml(input.consentNotice)}</Say>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}<Dial${recordAttr}${recordingCallback}>${escapeXml(input.customerPhone)}</Dial></Response>`;
}

/** TwiML for inbound calls to the Twilio number: bridge to the assigned agent if known. */
export function buildInboundTwiML(input: {
  agentPhone?: string;
  record: boolean;
  recordingStatusCallback: string;
  consentNotice: string | null;
  fallbackMessage?: string;
}): string {
  if (!input.agentPhone) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">${escapeXml(input.fallbackMessage ?? "ধন্যবাদ, কিন্তু এখন কোনো এজেন্ট যুক্ত নেই।")}</Say></Response>`;
  }
  const recordAttr = input.record ? ' record="record-from-answer-dual"' : "";
  const recordingCallback = input.record
    ? ` recordingStatusCallback="${escapeXml(input.recordingStatusCallback)}" recordingStatusCallbackEvent="completed failed"`
    : "";
  const say = input.consentNotice
    ? `<Say voice="alice">${escapeXml(input.consentNotice)}</Say>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}<Dial${recordAttr}${recordingCallback}>${escapeXml(input.agentPhone)}</Dial></Response>`;
}

/**
 * TwiML that hands the live call to our ConversationRelay WebSocket so the AI
 * assistant can talk to the caller in real time.
 */
export function buildConversationRelayTwiML(input: {
  websocketUrl: string;
  actionUrl: string;
  welcomeGreeting: string;
  language: string;
  ttsLanguage: string;
  voice: string | null;
  leadId: string | null;
  consentNotice: string | null;
}): string {
  const say = input.consentNotice ? `<Say language="bn-IN">${escapeXml(input.consentNotice)}</Say>` : "";
  const voiceAttr = input.voice ? ` voice="${escapeXml(input.voice)}"` : "";
  const parameter = input.leadId
    ? `<Parameter name="leadId" value="${escapeXml(input.leadId)}"/>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say}<Connect action="${escapeXml(input.actionUrl)}"><ConversationRelay url="${escapeXml(input.websocketUrl)}" welcomeGreeting="${escapeXml(input.welcomeGreeting)}" language="${escapeXml(input.language)}" ttsLanguage="${escapeXml(input.ttsLanguage)}"${voiceAttr} transcriptionLanguage="${escapeXml(input.language)}" dtmfDetection="true" interruptible="true">${parameter}</ConversationRelay></Connect></Response>`;
}

/** Validates the X-Twilio-Signature header for both GET and POST requests. */
export function validateSignature(
  cfg: TwilioConfig,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!cfg.authToken) return false;
  if (!signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let value = url;
  for (const key of sortedKeys) {
    value += key;
    value += params[key];
  }

  const expected = createHmac("sha1", cfg.authToken).update(value).digest("base64");
  const got = Buffer.from(signature);
  const exp = Buffer.from(expected);
  if (got.length !== exp.length) return false;
  return timingSafeEqual(got, exp);
}

/** Extracts form params from a request, preserving arrays Twilio may send. */
export async function twilioFormData(request: Request): Promise<Record<string, string>> {
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function parseTwilioResponse(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { message: text };
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Normalise Bangladesh numbers to E.164; leave already-plus numbers alone. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (raw.trim().startsWith("+")) return `+${digits}`;
  if (digits.length === 10 && digits.startsWith("1")) return `+880${digits}`;
  if (digits.length === 11 && digits.startsWith("01")) return `+880${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("880")) return `+${digits}`;
  return `+${digits}`;
}
