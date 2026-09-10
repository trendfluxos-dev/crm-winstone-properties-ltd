import { buildAgentStats, buildBillingSummary, DEFAULT_RATE_PER_MINUTE } from "@/lib/crm-data";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash";

export type CopilotMessage = { role: "user" | "assistant"; content: string };
export type CopilotCard = { title: string; rows: { label: string; value: string }[] };

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "floor_report",
      description:
        "Per-agent performance: dials, connected calls, talk time, average call length, WhatsApp touches, assigned leads, deals won.",
      parameters: {
        type: "object",
        properties: {
          today_only: { type: "boolean", description: "Limit to today's activity" },
          limit: { type: "number", description: "How many top agents to return" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "billing_report",
      description:
        "Monthly telephony billing: dials, connected %, billable minutes, estimated carrier cost, AI analysed calls, deals won.",
      parameters: {
        type: "object",
        properties: {
          rate_per_minute: { type: "number", description: "Carrier rate in BDT per minute" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assign_leads",
      description:
        "Assign unassigned/pending leads to one agent by name. Use only when the user asks to distribute or push leads.",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          count: { type: "number" },
        },
        required: ["agent_name", "count"],
      },
    },
  },
] as const;

async function snapshot() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [profiles, leads, calls, messages] = await Promise.all([
    supabaseAdmin.from("profiles").select("*").order("name"),
    supabaseAdmin.from("leads").select("*").order("updated_at", { ascending: false }),
    supabaseAdmin.from("call_recordings").select("*").limit(2000),
    supabaseAdmin.from("whatsapp_interactions").select("*").limit(2000),
  ]);
  return {
    profiles: profiles.data ?? [],
    leads: leads.data ?? [],
    calls: calls.data ?? [],
    messages: messages.data ?? [],
  };
}

function fmtMinutes(seconds: number) {
  return `${Math.round(seconds / 60)} min`;
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; card?: CopilotCard; mutated: boolean }> {
  const snap = await snapshot();

  if (name === "floor_report") {
    const todayOnly = Boolean(args["today_only"]);
    const limit = Math.min(Number(args["limit"] ?? 5) || 5, 20);
    const stats = buildAgentStats(snap.profiles, snap.leads, snap.calls, snap.messages, todayOnly)
      .slice(0, limit)
      .map((s) => ({
        agent: s.profile.name,
        employee_id: s.profile.employee_id,
        dials: s.dials,
        connected: s.connected,
        talk_time: fmtMinutes(s.talkSeconds),
        avg_call: `${Math.round(s.avgCallSeconds)}s`,
        whatsapp: s.whatsappTouches,
        assigned_leads: s.assigned,
        deals_won: s.closedWon,
      }));
    return {
      data: { window: todayOnly ? "today" : "all time", agents: stats },
      card: {
        title: todayOnly ? "Today's floor report" : "Floor report",
        rows: stats.map((s) => ({
          label: s.agent,
          value: `${s.connected} connected · ${s.talk_time} · ${s.deals_won} won`,
        })),
      },
      mutated: false,
    };
  }

  if (name === "billing_report") {
    const rate = Number(args["rate_per_minute"] ?? DEFAULT_RATE_PER_MINUTE) || DEFAULT_RATE_PER_MINUTE;
    const bill = buildBillingSummary(snap.calls, snap.leads, rate);
    return {
      data: bill,
      card: {
        title: `Billing — ${bill.monthLabel}`,
        rows: [
          { label: "Dials", value: String(bill.dials) },
          { label: "Connected", value: `${bill.connected} (${bill.connectedPct.toFixed(0)}%)` },
          { label: "Billable minutes", value: String(bill.billableMinutes) },
          { label: "Estimated carrier cost", value: `৳${bill.carrierCost.toFixed(2)}` },
          { label: "AI analysed calls", value: String(bill.aiAnalysed) },
          { label: "Deals won", value: String(bill.dealsWon) },
        ],
      },
      mutated: false,
    };
  }

  if (name === "assign_leads") {
    const wanted = String(args["agent_name"] ?? "").toLowerCase().trim();
    const count = Math.max(1, Math.min(Number(args["count"] ?? 0) || 0, 1000));
    const agent =
      snap.profiles.find((p) => p.name.toLowerCase() === wanted) ??
      snap.profiles.find((p) => p.name.toLowerCase().includes(wanted)) ??
      snap.profiles.find((p) => (p.employee_id ?? "").toLowerCase() === wanted);
    if (!agent) {
      return {
        data: { error: `No agent matching "${args["agent_name"]}"`, agents: snap.profiles.map((p) => p.name) },
        mutated: false,
      };
    }
    const pool = snap.leads
      .filter((l) => l.assigned_to === null && l.status === "pending")
      .slice(0, count);
    if (!pool.length) return { data: { assigned: 0, note: "No unassigned pending leads left" }, mutated: false };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("leads")
      .update({ assigned_to: agent.id })
      .in(
        "id",
        pool.map((l) => l.id),
      );
    if (error) return { data: { error: error.message }, mutated: false };

    return {
      data: { assigned: pool.length, agent: agent.name },
      card: {
        title: "Leads dispatched",
        rows: [
          { label: "Agent", value: agent.name },
          { label: "Leads assigned", value: String(pool.length) },
        ],
      },
      mutated: true,
    };
  }

  return { data: { error: `Unknown tool ${name}` }, mutated: false };
}

const SYSTEM = `You are the Executive AI Copilot inside "Winstone Connect — Tele-Sales OS".
You help the HQ authority and team coordinators read floor performance, generate monthly telephony billing, and dispatch leads.
Always call a tool for data instead of guessing numbers. Money is Bangladeshi Taka (৳).
Answer briefly (max 5 short lines or a compact list). If the user writes Bengali, answer in Bengali.`;

/** Runs one copilot turn, executing tools server-side. Returns the reply plus any result cards. */
export async function runCopilot(history: CopilotMessage[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");

  const messages: unknown[] = [
    {
      role: "system",
      content: `${SYSTEM}\nToday is ${new Date().toISOString().slice(0, 10)} (Asia/Dhaka floor).`,
    },
    ...history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
  ];
  const cards: CopilotCard[] = [];
  let mutated = false;

  for (let round = 0; round < 4; round += 1) {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("copilot gateway error", res.status, detail);
      if (res.status === 429) throw new Error("AI is busy right now — try again in a moment");
      throw new Error("The AI copilot is unavailable right now");
    }
    const body = (await res.json()) as {
      choices?: {
        message?: {
          content?: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
    };
    const message = body.choices?.[0]?.message;
    if (!message) throw new Error("Empty response from the AI copilot");

    if (message.tool_calls?.length) {
      messages.push(message);
      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args);
        if (result.card) cards.push(result.card);
        mutated = mutated || result.mutated;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result.data),
        });
      }
      continue;
    }

    return { reply: message.content?.trim() || "Done.", cards, mutated };
  }

  return { reply: "I gathered the data but could not finish the summary. Please retry.", cards, mutated };
}
