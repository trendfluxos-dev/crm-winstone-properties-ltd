/**
 * Twilio ConversationRelay support: live AI voice sessions.
 *
 * Twilio opens a WebSocket to /api/public/twilio/relay, sends `setup` then
 * `prompt` messages, and speaks whatever `text` tokens we send back. Everything
 * a caller says and everything the AI answers is stored turn by turn so HQ can
 * read the conversation afterwards.
 */

export type RelaySettings = {
  enabled: boolean;
  language: string;
  ttsLanguage: string;
  voice: string | null;
  greeting: string;
  handoffEnabled: boolean;
};

const DEFAULT_SETTINGS: RelaySettings = {
  enabled: false,
  language: "bn-IN",
  ttsLanguage: "bn-IN",
  voice: null,
  greeting: "আসসালামু আলাইকুম, Winstone-এ কল করেছেন। বলুন, কীভাবে সাহায্য করতে পারি?",
  handoffEnabled: true,
};

const SETTINGS_KEY = "ai_voice";

/** Reads the AI voice configuration; disabled until an admin turns it on. */
export async function relaySettings(): Promise<RelaySettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();

  const value = (data?.value ?? {}) as Partial<RelaySettings>;
  return {
    enabled: value.enabled === true,
    language: typeof value.language === "string" ? value.language : DEFAULT_SETTINGS.language,
    ttsLanguage: typeof value.ttsLanguage === "string" ? value.ttsLanguage : DEFAULT_SETTINGS.ttsLanguage,
    voice: typeof value.voice === "string" && value.voice ? value.voice : null,
    greeting: typeof value.greeting === "string" && value.greeting ? value.greeting : DEFAULT_SETTINGS.greeting,
    handoffEnabled: value.handoffEnabled !== false,
  };
}

export async function saveRelaySettings(next: {
  [K in keyof RelaySettings]?: RelaySettings[K] | undefined;
}): Promise<RelaySettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const current = await relaySettings();
  const merged: RelaySettings = { ...current };
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }
  const { error } = await supabaseAdmin
    .from("system_settings")
    .upsert({ key: SETTINGS_KEY, value: merged as never, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return merged;
}

export type RelaySession = {
  rowId: string;
  leadId: string | null;
  leadName: string | null;
  agentPhone: string | null;
  agentId: string | null;
  systemPrompt: string;
  greeting: string;
  language: string;
};

/** Creates (or reuses) the session row for a call and builds the AI's context. */
export async function openSession(input: {
  sessionId: string;
  callSid: string;
  from: string;
  to: string;
  direction: string;
  language: string;
  greeting: string;
}): Promise<RelaySession> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { normalizePhone } = await import("@/lib/twilio.server");
  const normalized = normalizePhone(input.from);

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, phone_number, status, notes, assigned_to")
    .or(`phone_number.eq.${normalized},phone_number.ilike.%${normalized.slice(-9)}`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let agentPhone: string | null = null;
  let agentId: string | null = null;
  if (lead?.assigned_to) {
    const { data: agent } = await supabaseAdmin
      .from("profiles")
      .select("id, name, phone, is_active, approval_status")
      .eq("id", lead.assigned_to)
      .maybeSingle();
    if (agent?.is_active && agent.approval_status === "approved" && agent.phone) {
      agentPhone = normalizePhone(agent.phone);
      agentId = agent.id;
    }
  }

  // Recent history with this customer, so the AI does not ask what it already knows.
  let history = "";
  if (lead?.id) {
    const { data: reports } = await supabaseAdmin
      .from("call_reports")
      .select("summary, category, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(3);
    history = (reports ?? [])
      .map((r) => `- ${r.created_at?.slice(0, 10) ?? ""} (${r.category ?? "—"}): ${r.summary ?? ""}`)
      .join("\n");
  }

  const { data: existing } = await supabaseAdmin
    .from("ai_voice_sessions")
    .select("id")
    .eq("call_sid", input.callSid)
    .maybeSingle();

  let rowId = existing?.id ?? null;
  if (!rowId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("ai_voice_sessions")
      .insert({
        session_id: input.sessionId,
        call_sid: input.callSid,
        lead_id: lead?.id ?? null,
        from_number: normalized,
        to_number: input.to,
        direction: input.direction || "inbound",
        status: "active",
        language: input.language,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    rowId = inserted.id;
  }

  const systemPrompt = [
    "You are Winstone BD's Bengali-speaking phone assistant for a Bangladesh sales team.",
    "Speak natural spoken Bengali (Bangladesh), short sentences, one question at a time.",
    "Never invent prices, delivery dates, stock or offers. If you do not know, say you will connect a human agent.",
    "Never ask for card numbers, PIN, OTP or passwords.",
    "Your job: greet, understand what the caller needs, capture their requirement, and offer a callback from their agent.",
    "If the caller asks for a human, is angry, or the matter needs a decision, reply that you are connecting an agent and then stop.",
    lead
      ? `Known customer: ${lead.name ?? "নাম নেই"} (${lead.phone_number}), current status: ${lead.status ?? "নতুন"}.`
      : "This caller is not in the CRM yet; treat them as a new lead.",
    lead?.notes ? `Notes: ${String(lead.notes).slice(0, 500)}` : "",
    history ? `Recent calls:\n${history}` : "",
    agentPhone ? "A human agent is available for handoff." : "No human agent is available right now; promise a callback instead.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    rowId: rowId!,
    leadId: lead?.id ?? null,
    leadName: lead?.name ?? null,
    agentPhone,
    agentId,
    systemPrompt,
    greeting: input.greeting,
    language: input.language,
  };
}

export async function saveTurn(input: {
  rowId: string;
  turnIndex: number;
  role: "customer" | "assistant" | "system";
  content: string;
  language?: string | null;
  interrupted?: boolean;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("ai_voice_turns").insert({
    session_row_id: input.rowId,
    turn_index: input.turnIndex,
    role: input.role,
    content: input.content.slice(0, 4000),
    language: input.language ?? null,
    interrupted: input.interrupted ?? false,
  });
  await supabaseAdmin
    .from("ai_voice_sessions")
    .update({ turn_count: input.turnIndex + 1, updated_at: new Date().toISOString() })
    .eq("id", input.rowId);
}

export async function closeSession(input: {
  rowId: string;
  status: "completed" | "handoff" | "failed";
  handoffReason?: string | null;
  handoffAgentId?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("ai_voice_sessions")
    .update({
      status: input.status,
      handoff_reason: input.handoffReason ?? null,
      handoff_agent_id: input.handoffAgentId ?? null,
      error_message: input.errorMessage ?? null,
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.rowId);
}

export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

/**
 * Streams the AI reply token by token so Twilio can start speaking immediately.
 * onToken receives raw text chunks; onDone gets the full reply.
 */
export async function streamReply(
  messages: ChatTurn[],
  onToken: (token: string) => void,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI gateway key missing");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      messages,
      stream: true,
      max_tokens: 300,
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI gateway failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const json = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const token = json.choices?.[0]?.delta?.content;
        if (token) {
          full += token;
          onToken(token);
        }
      } catch {
        // partial JSON frame; ignore and wait for the next chunk
      }
    }
  }

  return full;
}

const HANDOFF_PATTERNS = [
  /\bhuman\b/i,
  /\bagent\b/i,
  /মানুষ/,
  /এজেন্ট/,
  /কর্মকর্তা/,
  /কারো সাথে কথা/,
  /লোকের সাথে/,
];

/** True when the caller (or the AI's own reply) asks for a real person. */
export function wantsHuman(text: string): boolean {
  return HANDOFF_PATTERNS.some((pattern) => pattern.test(text));
}
