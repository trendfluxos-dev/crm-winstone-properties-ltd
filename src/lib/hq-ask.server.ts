import { meteredFetch } from "@/lib/metered-fetch.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChartSpec = {
  kind: "bar" | "line" | "none";
  title: string;
  xKey: string;
  series: { key: string; label: string }[];
  data: Record<string, string | number>[];
};

export type HqAnswer = { answer: string; chart: ChartSpec };

const CONNECTED = 30;

/** Compact floor facts the model can turn into an answer and a chart. */
export async function buildFloorFacts() {
  const [{ data: profiles }, { data: leads }, { data: calls }, { data: messages }] =
    await Promise.all([
      supabaseAdmin.from("profiles").select("id, name, role, approval_status, is_active"),
      supabaseAdmin.from("leads").select("id, assigned_to, status, outcome_category, created_at"),
      supabaseAdmin
        .from("call_recordings")
        .select("agent_id, duration_seconds, sentiment, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      supabaseAdmin
        .from("whatsapp_interactions")
        .select("agent_id, sender_type, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
    ]);

  const agents = (profiles ?? []).filter((p) => p.approval_status !== "rejected");

  const perAgent = agents.map((agent) => {
    const myCalls = (calls ?? []).filter((c) => c.agent_id === agent.id);
    const myLeads = (leads ?? []).filter((l) => l.assigned_to === agent.id);
    return {
      agent: agent.name,
      role: agent.role,
      leads: myLeads.length,
      pending: myLeads.filter((l) => l.status === "pending").length,
      closed: myLeads.filter((l) => l.status === "closed").length,
      dials: myCalls.length,
      connected: myCalls.filter((c) => c.duration_seconds > CONNECTED).length,
      talk_minutes: Math.round(myCalls.reduce((s, c) => s + c.duration_seconds, 0) / 60),
      whatsapp: (messages ?? []).filter((m) => m.agent_id === agent.id).length,
    };
  });

  const byDay = new Map<string, { day: string; dials: number; connected: number }>();
  for (const call of calls ?? []) {
    const day = (call.created_at ?? "").slice(0, 10);
    if (!day) continue;
    const row = byDay.get(day) ?? { day, dials: 0, connected: 0 };
    row.dials += 1;
    if (call.duration_seconds > CONNECTED) row.connected += 1;
    byDay.set(day, row);
  }

  return {
    totals: {
      agents: perAgent.length,
      leads: (leads ?? []).length,
      unassigned_leads: (leads ?? []).filter((l) => l.assigned_to === null).length,
      dials: (calls ?? []).length,
      connected_calls: (calls ?? []).filter((c) => c.duration_seconds > CONNECTED).length,
      talk_minutes: Math.round((calls ?? []).reduce((s, c) => s + c.duration_seconds, 0) / 60),
      whatsapp_messages: (messages ?? []).length,
      closed_leads: (leads ?? []).filter((l) => l.status === "closed").length,
    },
    per_agent: perAgent,
    per_day: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)).slice(-30),
  };
}

const SYSTEM = `You are the Executive HQ analyst for a tele-sales floor.
You are given the complete current floor data as JSON. Answer the executive's question
using ONLY those numbers — never invent figures.
Reply with strict JSON:
{"answer": "2-5 short sentences of plain-language insight",
 "chart": {"kind": "bar" | "line" | "none", "title": "string", "xKey": "string",
           "series": [{"key": "string", "label": "string"}],
           "data": [{"<xKey>": "label", "<series key>": number}]}}
Use kind "none" only when a chart would not help. Keep data under 20 rows and use
short labels. Never include markdown fences.`;

export async function askFloorQuestion(question: string): Promise<HqAnswer> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  const facts = await buildFloorFacts();

  const response = await meteredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "google/gemini-3-flash",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Floor data JSON:\n${JSON.stringify(facts)}\n\nQuestion: ${question}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  }, { provider: "lovable-ai", operation: "hq_ask", category: "command_agent" });

  if (response.status === 429) throw new Error("AI is busy right now — try again in a moment");
  if (response.status === 402) throw new Error("AI credits are exhausted for this workspace");
  if (!response.ok) throw new Error(`AI request failed (${response.status})`);

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw) as HqAnswer;
    return {
      answer: parsed.answer ?? "No answer returned.",
      chart:
        parsed.chart && parsed.chart.kind !== "none" && Array.isArray(parsed.chart.data)
          ? parsed.chart
          : { kind: "none", title: "", xKey: "", series: [], data: [] },
    };
  } catch {
    return {
      answer: raw || "No answer returned.",
      chart: { kind: "none", title: "", xKey: "", series: [], data: [] },
    };
  }
}
