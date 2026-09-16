import { meteredFetch } from "@/lib/metered-fetch.server";
import type { CallRecording, Lead } from "@/lib/crm-data";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";

export type PreCallBrief = {
  leadId: string;
  leadName: string;
  headline: string;
  opener: string;
  talkingPoints: string[];
  objections: { objection: string; response: string }[];
  nextAction: string;
  risk: string | null;
  generatedAt: string;
  aiAvailable: boolean;
};

const SYSTEM = `You are the AI pre-call assistant inside "Winstone Connect" for Winstone Properties Ltd (real estate, Bangladesh).
You read ONE lead's real history (past call transcripts, AI summaries, submitted call reports, notes) and prepare the agent for the next phone call.
Rules:
- Write everything in Bengali (Bangla). Money is Bangladeshi Taka (৳).
- Use ONLY the supplied evidence. Never invent a fact, price, quote or promise.
- Keep it short and usable while the phone is ringing.
- If there is no history, say so plainly and give a clean first-contact opener.
Reply as strict JSON only:
{"headline":"max 10 words","opener":"1-2 sentences the agent can say","talking_points":["..."],"objections":[{"objection":"...","response":"..."}],"next_action":"one concrete action","risk":"one short warning or null"}`;

async function loadLead(leadId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [leadRes, callsRes, reportsRes] = await Promise.all([
    supabaseAdmin.from("leads").select("*").eq("id", leadId).maybeSingle(),
    supabaseAdmin
      .from("call_recordings")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("call_reports")
      .select("category, summary, note, reason, follow_up_at, submitted_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if (leadRes.error) throw new Error(leadRes.error.message);
  if (!leadRes.data) throw new Error("লিড পাওয়া যায়নি");
  if (callsRes.error) throw new Error(callsRes.error.message);
  if (reportsRes.error) throw new Error(reportsRes.error.message);
  return {
    lead: leadRes.data as Lead,
    calls: (callsRes.data ?? []) as CallRecording[],
    reports: reportsRes.data ?? [],
  };
}

function fallback(
  lead: Lead,
  hasHistory: boolean,
): Omit<PreCallBrief, "leadId" | "leadName" | "generatedAt" | "aiAvailable"> {
  return {
    headline: hasHistory ? "আগের কথাবার্তা পড়ে কল করুন" : "প্রথম যোগাযোগ",
    opener: hasHistory
      ? `আসসালামু আলাইকুম, ${lead.name}। Winstone Properties থেকে বলছি — আগের আলোচনার সূত্রে ফোন করলাম।`
      : `আসসালামু আলাইকুম, ${lead.name}। Winstone Properties থেকে বলছি, দুই মিনিট সময় হবে?`,
    talkingPoints: [
      lead.notes ? `নোট: ${lead.notes.slice(0, 160)}` : "প্রয়োজন ও বাজেট জেনে নিন।",
      `এখন পর্যন্ত ${lead.call_attempts}টি কল চেষ্টা হয়েছে।`,
    ].filter(Boolean),
    objections: [],
    nextAction: "কল শেষে ক্যাটাগরি, সারসংক্ষেপ, নোট ও ফলো-আপ তারিখ দিয়ে রিপোর্ট জমা দিন।",
    risk: null,
  };
}

/** Grounded pre-call briefing for a single lead. */
export async function buildPreCallBrief(leadId: string): Promise<PreCallBrief> {
  const { lead, calls, reports } = await loadLead(leadId);
  const hasHistory = calls.length > 0 || reports.length > 0;
  const base = {
    leadId: lead.id,
    leadName: lead.name,
    generatedAt: new Date().toISOString(),
  };

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { ...base, ...fallback(lead, hasHistory), aiAvailable: false };

  const evidence = {
    lead: {
      name: lead.name,
      company: lead.company,
      status: lead.status,
      outcome_category: lead.outcome_category,
      attempts: lead.call_attempts,
      last_call_at: lead.last_call_at,
      notes: (lead.notes ?? "").slice(0, 600),
    },
    calls: calls.map((c) => ({
      at: c.created_at.slice(0, 16).replace("T", " "),
      seconds: c.duration_seconds,
      sentiment: c.sentiment,
      objections: c.customer_objections,
      summary: (c.ai_summary ?? "").slice(0, 400),
      transcript: (c.transcription_text ?? "").slice(0, 900),
    })),
    reports,
  };

  try {
    const res = await meteredFetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: `${SYSTEM}\nToday is ${new Date().toISOString().slice(0, 10)}.`,
          },
          { role: "user", content: JSON.stringify(evidence) },
        ],
        response_format: { type: "json_object" },
      }),
    }, { provider: "lovable-ai", operation: "precall", category: "command_agent", model: MODEL });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("precall gateway error", res.status, detail);
      throw new Error(
        res.status === 402 || res.status === 403
          ? "AI ক্রেডিট নেই — শুধু তথ্য দেখানো হলো"
          : "AI ব্রিফিং এখন পাওয়া যাচ্ছে না",
      );
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}") as {
      headline?: string;
      opener?: string;
      talking_points?: string[];
      objections?: { objection?: string; response?: string }[];
      next_action?: string;
      risk?: string | null;
    };
    const fb = fallback(lead, hasHistory);
    return {
      ...base,
      headline: parsed.headline?.trim() || fb.headline,
      opener: parsed.opener?.trim() || fb.opener,
      talkingPoints: (parsed.talking_points ?? []).filter(Boolean).slice(0, 5).map(String),
      objections: (parsed.objections ?? [])
        .filter((o) => o?.objection && o?.response)
        .slice(0, 4)
        .map((o) => ({ objection: String(o.objection), response: String(o.response) })),
      nextAction: parsed.next_action?.trim() || fb.nextAction,
      risk: parsed.risk?.toString().trim() || null,
      aiAvailable: true,
    };
  } catch (error) {
    console.error("precall failed", error);
    return { ...base, ...fallback(lead, hasHistory), aiAvailable: false };
  }
}
