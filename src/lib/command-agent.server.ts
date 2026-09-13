import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Caller } from "@/lib/access.server";

/**
 * Command Agent — one in-app assistant shared by all four surfaces
 * (Sales Agent, Coordinator Deck, Executive HQ, IT Console).
 *
 * It answers in plain Bengali from live data only, and may PROPOSE actions from
 * a fixed whitelist. Nothing is executed by the model: the person presses the
 * button, and the action then runs through the same role checks the rest of the
 * CRM uses. That keeps an agent from ever touching another agent's lead and a
 * viewing-only HQ session from writing anything.
 */

export type Surface = "desk" | "dispatch" | "hq" | "system";

export type CommandActionType =
  | "assign_leads"
  | "distribute_unassigned"
  | "classify_lead"
  | "retry_recording"
  | "verify_drive"
  | "generate_shift_summary"
  | "acknowledge_alert"
  | "retry_failed_recordings";

export type CommandAction = {
  type: CommandActionType;
  label: string;
  /** Loose bag validated per action when it actually runs. */
  params: Record<string, string | number | null>;
};

export type CommandAnswer = {
  answer: string;
  /** Facts the answer stands on, so nobody has to trust the model blindly. */
  facts: string[];
  actions: CommandAction[];
};

const CONNECTED = 30;

function scopeLabel(caller: Caller): "agent" | "coordinator" | "authority" | "none" {
  return caller.scope;
}

/** Which actions this caller is even allowed to be offered. */
export function allowedActions(caller: Caller): CommandActionType[] {
  if (caller.readOnly) return [];
  switch (scopeLabel(caller)) {
    case "authority":
      return [
        "assign_leads",
        "distribute_unassigned",
        "classify_lead",
        "retry_recording",
        "verify_drive",
        "generate_shift_summary",
        "acknowledge_alert",
        "retry_failed_recordings",
      ];
    case "coordinator":
      return [
        "assign_leads",
        "distribute_unassigned",
        "classify_lead",
        "generate_shift_summary",
        "acknowledge_alert",
      ];
    case "agent":
      return ["classify_lead"];
    default:
      return [];
  }
}

/** Live, role-scoped facts. An agent only ever sees their own rows. */
export async function buildCommandFacts(caller: Caller, surface: Surface) {
  const me = caller.profile?.id ?? null;
  const isAgentScope = caller.scope === "agent";

  const [{ data: profiles }, { data: leads }, { data: calls }, { data: reports }, { data: followUps }] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, role, is_active, approval_status, presence"),
      supabaseAdmin
        .from("leads")
        .select(
          "id, name, phone_number, status, assigned_to, assigned_agent_id, temperature, grade, call_attempts, last_call_at, created_at",
        )
        .order("updated_at", { ascending: false })
        .limit(1200),
      supabaseAdmin
        .from("call_recordings")
        .select(
          "id, agent_id, lead_id, duration_seconds, created_at, sync_status, analysis_status, stt_status, ai_summary, ai_temperature, ai_grade",
        )
        .order("created_at", { ascending: false })
        .limit(600),
      supabaseAdmin
        .from("call_reports")
        .select("id, agent_id, lead_id, status, category, temperature, grade, submitted_at, created_at")
        .order("created_at", { ascending: false })
        .limit(600),
      supabaseAdmin
        .from("follow_up_events")
        .select("id, agent_id, lead_id, status, scheduled_at, category, priority")
        .in("status", ["scheduled", "pending", "due"])
        .order("scheduled_at")
        .limit(300),
    ]);

  const owner = (lead: { assigned_to: string | null; assigned_agent_id: string | null }) =>
    lead.assigned_to ?? lead.assigned_agent_id ?? null;

  const myLeads = isAgentScope ? (leads ?? []).filter((l) => owner(l) === me) : (leads ?? []);
  const myLeadIds = new Set(myLeads.map((l) => l.id));
  const myCalls = isAgentScope
    ? (calls ?? []).filter((c) => c.agent_id === me || (c.lead_id && myLeadIds.has(c.lead_id)))
    : (calls ?? []);
  const myReports = isAgentScope ? (reports ?? []).filter((r) => r.agent_id === me) : (reports ?? []);
  const myFollowUps = isAgentScope
    ? (followUps ?? []).filter((f) => f.agent_id === me)
    : (followUps ?? []);

  const staff = (profiles ?? []).filter((p) => p.approval_status === "approved" && p.is_active);

  const base = {
    surface,
    scope: caller.scope,
    read_only: caller.readOnly,
    me: caller.profile?.name ?? (caller.scope === "authority" ? "Authority PIN" : null),
    totals: {
      leads: myLeads.length,
      pending_leads: myLeads.filter((l) => l.status === "pending").length,
      follow_up_leads: myLeads.filter((l) => l.status === "follow_up").length,
      closed_leads: myLeads.filter((l) => l.status === "closed").length,
      unclassified_leads: myLeads.filter((l) => !l.temperature || !l.grade).length,
      dials: myCalls.length,
      connected_calls: myCalls.filter((c) => (c.duration_seconds ?? 0) > CONNECTED).length,
      talk_minutes: Math.round(myCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60),
      unfinished_reports: myReports.filter((r) => r.status === "pending").length,
      open_follow_ups: myFollowUps.length,
    },
    leads_sample: myLeads.slice(0, 40).map((l) => ({
      id: l.id,
      name: l.name,
      phone: l.phone_number,
      status: l.status,
      temperature: l.temperature,
      grade: l.grade,
      attempts: l.call_attempts,
      last_call_at: l.last_call_at,
    })),
    follow_ups: myFollowUps.slice(0, 20).map((f) => ({
      lead_id: f.lead_id,
      at: f.scheduled_at,
      category: f.category,
      priority: f.priority,
    })),
  };

  if (isAgentScope) return base;

  const perAgent = staff.map((p) => {
    const agentLeads = (leads ?? []).filter((l) => owner(l) === p.id);
    const agentCalls = (calls ?? []).filter((c) => c.agent_id === p.id);
    return {
      agent_id: p.id,
      agent: p.name,
      role: p.role,
      presence: p.presence,
      leads: agentLeads.length,
      pending: agentLeads.filter((l) => l.status === "pending").length,
      closed: agentLeads.filter((l) => l.status === "closed").length,
      dials: agentCalls.length,
      connected: agentCalls.filter((c) => (c.duration_seconds ?? 0) > CONNECTED).length,
      talk_minutes: Math.round(agentCalls.reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60),
      unfinished_reports: (reports ?? []).filter((r) => r.agent_id === p.id && r.status === "pending")
        .length,
    };
  });

  const unassigned = (leads ?? []).filter((l) => owner(l) === null);

  // Open system problems, so the assistant can diagnose instead of guessing.
  const [{ data: alerts }, { data: syncFailures }] = await Promise.all([
    supabaseAdmin
      .from("system_alerts")
      .select("id, code, severity, title, detail, action, created_at")
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("sync_events")
      .select("id, event_type, entity_type, entity_id, status, error_message, created_at")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const pipeline = {
    recordings_recent: (calls ?? []).length,
    not_uploaded: (calls ?? []).filter((c) => c.sync_status === "failed").length,
    awaiting_transcript: (calls ?? []).filter(
      (c) => c.stt_status !== "completed" && c.stt_status !== "done",
    ).length,
    awaiting_ai: (calls ?? []).filter((c) => !c.ai_summary).length,
    stuck_recording_ids: (calls ?? [])
      .filter((c) => c.analysis_status === "failed" || c.sync_status === "failed")
      .slice(0, 15)
      .map((c) => c.id),
  };

  return {
    ...base,
    per_agent: perAgent,
    unassigned_leads: unassigned.length,
    unassigned_sample: unassigned.slice(0, 20).map((l) => ({ id: l.id, name: l.name })),
    pipeline,
    open_alerts: alerts ?? [],
    sync_failures: syncFailures ?? [],
  };
}

const ACTION_CATALOGUE = `Available action types (only propose ones in "allowed_actions"):
- assign_leads      params: { agent_id: uuid, agent_name: string, count: number }  → moves that many pending unassigned leads to one agent
- distribute_unassigned params: {}                                                → splits every unassigned lead evenly across active agents
- classify_lead     params: { lead_id: uuid, lead_name: string, temperature: "hot"|"warm"|"cold", grade: "A"|"B"|"C"|"D", note?: string }
- retry_recording   params: { recording_id: uuid, step: "drive"|"analysis" }       → re-runs a stuck recording step (idempotent)
- verify_drive      params: { limit: number }                                      → checks real Drive files behind recent backups
- generate_shift_summary params: {}                                               → rebuilds the current shift summary sheet
- acknowledge_alert  params: { alert_id: uuid }                                    → marks one open system alert as handled
- retry_failed_recordings params: { limit: number }                                → re-runs transcript/AI for the recordings whose analysis failed (idempotent)`;

const SYSTEM = `You are "Winstone AI", the operations assistant inside a Bangladeshi tele-sales CRM (Winstone).
Always reply in Bengali, short and concrete, like a floor supervisor talking to a colleague.

Hard rules:
- Use ONLY the numbers in the provided JSON. Never invent a figure, a name, an id, or a status.
- Never claim a call connected, a message was delivered, a recording synced, or a backup exists unless the JSON says so.
- Respect the caller's scope: an agent only sees their own leads; a read_only session cannot change anything.
- Propose an action ONLY when the user asked for something to be done AND its type is in allowed_actions.
  Copy ids verbatim from the JSON. If the right id is not in the JSON, do not propose the action — ask for the missing detail instead.
- When allowed_actions is empty, answer only and explain that this session cannot make changes.
- When the JSON shows open alerts, failed syncs or stuck pipeline rows, diagnose them: name the real error text, say what it blocks, and propose the repair action that fixes it. Never call something fixed until an action has actually run.

${ACTION_CATALOGUE}

Think before answering: check the numbers, look for the real blocker, then answer.
Keep facts under 5 items and actions under 4. Unused params are null.`;

/**
 * Strict output shape. Every property is required and optional values are
 * nullable — that is what the Responses API needs for schema-enforced JSON.
 */
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "facts", "actions"],
  properties: {
    answer: { type: "string" },
    facts: { type: "array", items: { type: "string" } },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label", "params"],
        properties: {
          type: {
            type: "string",
            enum: [
              "assign_leads",
              "distribute_unassigned",
              "classify_lead",
              "retry_recording",
              "verify_drive",
              "generate_shift_summary",
              "acknowledge_alert",
              "retry_failed_recordings",
            ],
          },
          label: { type: "string" },
          params: {
            type: "object",
            additionalProperties: false,
            required: [
              "agent_id",
              "count",
              "lead_id",
              "temperature",
              "grade",
              "note",
              "recording_id",
              "step",
              "limit",
              "alert_id",
            ],
            properties: {
              agent_id: { type: ["string", "null"] },
              count: { type: ["number", "null"] },
              lead_id: { type: ["string", "null"] },
              temperature: { type: ["string", "null"] },
              grade: { type: ["string", "null"] },
              note: { type: ["string", "null"] },
              recording_id: { type: ["string", "null"] },
              step: { type: ["string", "null"] },
              limit: { type: ["number", "null"] },
              alert_id: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  },
} as const;

/** Reads the streamed Responses SSE body and returns the joined answer text. */
async function readResponsesStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    let cut = buffer.indexOf("\n");
    while (cut !== -1) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      cut = buffer.indexOf("\n");
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
        // A partial SSE frame is normal mid-stream; the next chunk completes it.
      }
    }
  }
  return text;
}

export async function runCommandAgent(
  caller: Caller,
  surface: Surface,
  question: string,
  history: { role: "user" | "assistant"; content: string }[] = [],
): Promise<CommandAnswer> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("এআই এখন কনফিগার করা নেই");

  const facts = await buildCommandFacts(caller, surface);
  const allowed = allowedActions(caller);

  // Reasoning model on the Responses API: it must stream, or a long thinking run
  // is cut off by the request timeout and billed for nothing.
  const response = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "medium", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: "winstone_answer",
          strict: true,
          schema: ANSWER_SCHEMA,
        },
      },
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM }] },
        ...history.slice(-6).map((turn) => ({
          role: turn.role,
          content: [
            turn.role === "assistant"
              ? { type: "output_text", text: turn.content }
              : { type: "input_text", text: turn.content },
          ],
        })),
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `allowed_actions: ${JSON.stringify(allowed)}\nlive_data: ${JSON.stringify(
                facts,
              )}\n\nপ্রশ্ন/নির্দেশ: ${question}`,
            },
          ],
        },
      ],
    }),
  });

  if (response.status === 429) throw new Error("এআই এখন ব্যস্ত — একটু পরে আবার চেষ্টা করুন");
  if (response.status === 402) throw new Error("এআই ক্রেডিট শেষ হয়ে গেছে");
  if (!response.ok || !response.body) {
    const detail = response.ok ? "" : await response.text().catch(() => "");
    console.error("[command-agent] gateway error", response.status, detail.slice(0, 300));
    throw new Error(`এআই সাড়া দেয়নি (${response.status})`);
  }

  const raw = await readResponsesStream(response.body);

  let parsed: Partial<CommandAnswer> = {};
  try {
    parsed = JSON.parse(raw) as Partial<CommandAnswer>;
  } catch {
    return { answer: raw || "উত্তর তৈরি হয়নি — আবার চেষ্টা করুন", facts: [], actions: [] };
  }


  // Never surface an action this caller may not run, whatever the model returned.
  const actions = (parsed.actions ?? [])
    .filter((a) => a && allowed.includes(a.type))
    .slice(0, 4)
    .map((a) => ({
      type: a.type,
      label: String(a.label ?? "চালান").slice(0, 80),
      params: (a.params ?? {}) as CommandAction["params"],
    }));

  return {
    answer: parsed.answer?.trim() || "উত্তর তৈরি হয়নি — আবার চেষ্টা করুন",
    facts: (parsed.facts ?? []).filter((f) => typeof f === "string").slice(0, 5),
    actions,
  };
}
