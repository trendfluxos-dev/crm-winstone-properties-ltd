import { buildAgentStats, type CallRecording, type Lead, type Profile, type WhatsappMessage } from "@/lib/crm-data";
import { parseConfig, type AppConfig } from "@/lib/crm-config";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

export type CoachBriefing = {
  agent: { id: string; name: string; employeeId: string | null };
  metrics: {
    dials: number;
    connected: number;
    connectRate: number;
    talkMinutes: number;
    avgCallSeconds: number;
    whatsappTouches: number;
    assigned: number;
    dealsWon: number;
    dialTarget: number;
    overdueFollowUps: number;
    untouchedLeads: number;
    sentiment: { positive: number; neutral: number; negative: number; critical: number };
    topObjections: { objection: string; count: number }[];
  };
  headline: string;
  summary: string;
  strengths: string[];
  risks: string[];
  nextSteps: { lead: string | null; action: string }[];
  generatedAt: string;
  aiAvailable: boolean;
};

async function loadAgentData(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profileRes, leadsRes, configRes] = await Promise.all([
    supabaseAdmin.from("profiles").select(PROFILE_SAFE_COLUMNS).eq("id", agentId).maybeSingle(),
    supabaseAdmin.from("leads").select("*").eq("assigned_to", agentId).order("updated_at", { ascending: false }),
    supabaseAdmin.from("app_config").select("data").eq("id", "default").maybeSingle(),
  ]);
  if (profileRes.error) throw new Error(profileRes.error.message);
  if (!profileRes.data) throw new Error("Agent not found");
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const leads = leadsRes.data ?? [];
  const leadIds = leads.map((l) => l.id);
  let calls: CallRecording[] = [];
  let messages: WhatsappMessage[] = [];
  if (leadIds.length) {
    const [callsRes, msgRes] = await Promise.all([
      supabaseAdmin
        .from("call_recordings")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(400),
      supabaseAdmin
        .from("whatsapp_interactions")
        .select("*")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(600),
    ]);
    if (callsRes.error) throw new Error(callsRes.error.message);
    if (msgRes.error) throw new Error(msgRes.error.message);
    calls = callsRes.data ?? [];
    messages = msgRes.data ?? [];
  }

  return {
    profile: profileRes.data as Profile,
    leads: leads as Lead[],
    calls,
    messages,
    config: parseConfig(configRes.data?.data ?? {}),
  };
}

function buildMetrics(
  profile: Profile,
  leads: Lead[],
  calls: CallRecording[],
  messages: WhatsappMessage[],
  config: AppConfig,
) {
  const stats = buildAgentStats([profile], leads, calls, messages)[0];
  const now = Date.now();
  const slaMs = config.rules.followUpSlaHours * 60 * 60 * 1000;
  const overdueFollowUps = leads.filter(
    (l) =>
      l.status === "follow_up" &&
      now - new Date(l.last_call_at ?? l.updated_at).getTime() > slaMs,
  ).length;
  const untouchedLeads = leads.filter((l) => l.call_attempts === 0 && l.status !== "closed").length;

  const sentiment = { positive: 0, neutral: 0, negative: 0, critical: 0 };
  const objections = new Map<string, number>();
  for (const call of calls) {
    if (call.sentiment) sentiment[call.sentiment] += 1;
    for (const o of call.customer_objections ?? []) {
      objections.set(o, (objections.get(o) ?? 0) + 1);
    }
  }

  const dials = stats?.dials ?? 0;
  const connected = stats?.connected ?? 0;
  return {
    dials,
    connected,
    connectRate: dials ? (connected / dials) * 100 : 0,
    talkMinutes: Math.round((stats?.talkSeconds ?? 0) / 60),
    avgCallSeconds: Math.round(stats?.avgCallSeconds ?? 0),
    whatsappTouches: stats?.whatsappTouches ?? 0,
    assigned: leads.length,
    dealsWon: stats?.closedWon ?? 0,
    dialTarget: config.rules.dailyDialTarget,
    overdueFollowUps,
    untouchedLeads,
    sentiment,
    topObjections: [...objections.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([objection, count]) => ({ objection, count })),
  };
}

/** Compact evidence pack: the model reads real transcripts and chats, never invented ones. */
function buildEvidence(leads: Lead[], calls: CallRecording[], messages: WhatsappMessage[]) {
  const leadName = new Map(leads.map((l) => [l.id, l.name]));
  const recentCalls = calls.slice(0, 12).map((c) => ({
    lead: leadName.get(c.lead_id ?? "") ?? "unknown",
    at: c.created_at.slice(0, 16).replace("T", " "),
    seconds: c.duration_seconds,
    sentiment: c.sentiment,
    stage: c.deal_stage,
    objections: c.customer_objections,
    summary: (c.ai_summary ?? "").slice(0, 300),
    transcript: (c.transcription_text ?? "").slice(0, 600),
  }));
  const recentChats = messages.slice(0, 25).map((m) => ({
    lead: leadName.get(m.lead_id ?? "") ?? "unknown",
    at: m.created_at.slice(0, 16).replace("T", " "),
    from: m.sender_type,
    type: m.message_type,
    text: (m.message_content ?? "").slice(0, 240),
  }));
  const openLeads = leads
    .filter((l) => l.status !== "closed")
    .slice(0, 20)
    .map((l) => ({
      name: l.name,
      status: l.status,
      attempts: l.call_attempts,
      last_call_at: l.last_call_at,
      notes: (l.notes ?? "").slice(0, 200),
    }));
  return { recentCalls, recentChats, openLeads };
}

const SYSTEM = `You are the AI Sales Coach inside "Winstone Connect — Tele-Sales OS" for Winstone Properties Ltd (real estate, Bangladesh).
You read one agent's real call transcripts, AI call summaries and WhatsApp logs, then coach them.
Rules:
- Use ONLY the supplied evidence. Never invent a lead, number or quote.
- Be direct and practical, like a floor manager. Money is Bangladeshi Taka (৳).
- Next steps must name a real lead from the evidence and one concrete action.
- If the evidence is empty, say plainly there is no activity yet and give starter coaching.
Reply as strict JSON only:
{"headline":"max 12 words","summary":"2-3 sentences","strengths":["..."],"risks":["..."],"next_steps":[{"lead":"lead name or null","action":"..."}]}`;

function fallback(name: string, metrics: CoachBriefing["metrics"]): Pick<CoachBriefing, "headline" | "summary" | "strengths" | "risks" | "nextSteps"> {
  const steps: CoachBriefing["nextSteps"] = [];
  if (metrics.overdueFollowUps) {
    steps.push({ lead: null, action: `Call back ${metrics.overdueFollowUps} overdue follow-up lead(s) today.` });
  }
  if (metrics.untouchedLeads) {
    steps.push({ lead: null, action: `Make first contact with ${metrics.untouchedLeads} lead(s) never dialled.` });
  }
  if (!steps.length) steps.push({ lead: null, action: "Keep dialling — nothing is overdue right now." });
  return {
    headline: metrics.dials ? `${metrics.connected} connected of ${metrics.dials} dials` : "No calls logged yet",
    summary: metrics.dials
      ? `${name} has ${metrics.dials} dials, ${metrics.talkMinutes} minutes of talk time and ${metrics.dealsWon} deal(s) won across ${metrics.assigned} leads.`
      : `${name} has ${metrics.assigned} leads assigned and no calls logged yet, so there is nothing to review.`,
    strengths: [],
    risks: metrics.overdueFollowUps ? [`${metrics.overdueFollowUps} follow-up(s) past the callback deadline`] : [],
    nextSteps: steps,
  };
}

/** Real-time coaching for one agent, grounded in their own calls and chats. */
export async function buildCoachBriefing(agentId: string): Promise<CoachBriefing> {
  const { profile, leads, calls, messages, config } = await loadAgentData(agentId);
  const metrics = buildMetrics(profile, leads, calls, messages, config);
  const base = {
    agent: { id: profile.id, name: profile.name, employeeId: profile.employee_id },
    metrics,
    generatedAt: new Date().toISOString(),
  };

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ...base, ...fallback(profile.name, metrics), aiAvailable: false };

  const evidence = buildEvidence(leads, calls, messages);
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: `${SYSTEM}\nToday is ${new Date().toISOString().slice(0, 10)}.` },
          {
            role: "user",
            content: JSON.stringify({
              agent: profile.name,
              rules: config.rules,
              metrics,
              evidence,
            }),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("coach gateway error", res.status, detail);
      if (res.status === 402 || res.status === 403) {
        throw new Error("AI credits are unavailable — showing the numbers only");
      }
      throw new Error("AI coach is unavailable right now");
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const raw = body.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      headline?: string;
      summary?: string;
      strengths?: string[];
      risks?: string[];
      next_steps?: { lead?: string | null; action?: string }[];
    };
    return {
      ...base,
      headline: parsed.headline?.trim() || fallback(profile.name, metrics).headline,
      summary: parsed.summary?.trim() || fallback(profile.name, metrics).summary,
      strengths: (parsed.strengths ?? []).filter(Boolean).slice(0, 5),
      risks: (parsed.risks ?? []).filter(Boolean).slice(0, 5),
      nextSteps: (parsed.next_steps ?? [])
        .filter((s) => s?.action)
        .slice(0, 5)
        .map((s) => ({ lead: s.lead ?? null, action: String(s.action) })),
      aiAvailable: true,
    };
  } catch (error) {
    console.error("coach failed", error);
    return { ...base, ...fallback(profile.name, metrics), aiAvailable: false };
  }
}
