/**
 * Executive HQ presentation, built ONLY from the updates the agents submitted
 * themselves (`call_reports`). It never reads recording, upload, pipeline or
 * device state, so no technical failure can ever surface on this surface —
 * those belong to the IT Console.
 *
 * Presentation windows (Dhaka time):
 *   08:50 – 12:49  morning shift, live as reports arrive
 *   12:50 – 17:29  the 12:50 report (09:00–12:45) + the live afternoon sync
 *   17:30 – 08:49  the full-day report, shown until 08:50 next morning
 *
 * Everything is recomputed on read, so when an agent edits an update inside the
 * edit window the presentation simply shows the newer numbers — HQ is never told
 * that an edit happened.
 */
import { dhakaInstant, dhakaParts } from "@/lib/shift.server";

const CATEGORY_LABEL: Record<string, string> = {
  hot_lead: "HOT LEAD",
  follow_up: "FOLLOW UP",
  interested: "INTERESTED",
  not_interested: "NOT INTERESTED",
  callback: "CALLBACK",
  no_answer: "NO ANSWER",
  wrong_number: "WRONG NUMBER",
  closed_converted: "CLOSED / CONVERTED",
};

const DAY_START = 9 * 60;
const MORNING_END = 12 * 60 + 45;
const MORNING_REPORT = 12 * 60 + 50;
const DAY_END = 17 * 60 + 20;
const DAY_REPORT = 17 * 60 + 30;
const NEXT_MORNING = 8 * 60 + 50;

export type BriefCall = {
  id: string;
  agentName: string;
  leadName: string;
  phone: string;
  fromLabel: string;
  toLabel: string;
  talkSeconds: number;
  talkLabel: string;
  connected: boolean;
  category: string;
  categoryLabel: string;
  temperature: string | null;
  grade: string | null;
  summary: string;
  followUpLabel: string | null;
};

export type BriefAgent = {
  agentId: string;
  name: string;
  employeeId: string | null;
  calls: number;
  connected: number;
  talkSeconds: number;
  talkLabel: string;
  hot: number;
  warm: number;
  cold: number;
  followUps: number;
  categories: { label: string; count: number }[];
  bestCategory: string | null;
  calls_detail: BriefCall[];
};

export type BriefLead = {
  leadId: string;
  name: string;
  phone: string;
  calls: number;
  connected: boolean;
  talkSeconds: number;
  talkLabel: string;
  lastTalkLabel: string;
  lastFromLabel: string;
  lastToLabel: string;
  categoryLabel: string;
  temperature: string | null;
  grade: string | null;
  summary: string;
  followUpLabel: string | null;
  lastAgentName: string;
};

export type BriefBlock = {
  label: string;
  live: boolean;
  fromLabel: string;
  toLabel: string;
  totals: {
    agentsWorking: number;
    calls: number;
    connected: number;
    talkSeconds: number;
    talkLabel: string;
    hot: number;
    warm: number;
    cold: number;
    followUps: number;
    conversations: number;
  };
  hourly: { hour: string; calls: number; connected: number; minutes: number }[];
  categories: { label: string; count: number }[];
  agents: BriefAgent[];
  leads: BriefLead[];
  narrative: string[];
};

export type ExecutiveBriefResult = {
  generatedAtLabel: string;
  windowKind: "morning_live" | "midday_report" | "day_report" | "previous_day";
  headline: string;
  subline: string;
  main: BriefBlock;
  /** Present between 12:50 and 17:29: the afternoon updates syncing in live. */
  liveAddon: BriefBlock | null;
};

function talkLabel(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} ঘ ${m} মি`;
  if (m > 0) return `${m} মি ${s} সে`;
  return `${s} সে`;
}

function clock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("bn-BD", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("bn-BD", {
    timeZone: "Asia/Dhaka",
    day: "numeric",
    month: "long",
  });
}

type ReportRow = {
  id: string;
  agent_id: string | null;
  lead_id: string | null;
  phone_number: string | null;
  category: string | null;
  summary: string | null;
  note: string | null;
  connected: boolean;
  duration_seconds: number | null;
  call_started_at: string | null;
  call_ended_at: string;
  follow_up_at: string | null;
  temperature: string | null;
  grade: string | null;
};

async function loadBlock(
  label: string,
  live: boolean,
  start: Date,
  end: Date,
): Promise<BriefBlock> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const [reportsRes, agentsRes] = await Promise.all([
    supabaseAdmin
      .from("call_reports")
      .select(
        "id, agent_id, lead_id, phone_number, category, summary, note, connected, duration_seconds, call_started_at, call_ended_at, follow_up_at, temperature, grade",
      )
      .eq("status", "submitted")
      .gte("call_ended_at", startIso)
      .lte("call_ended_at", endIso)
      .order("call_ended_at", { ascending: true }),
    supabaseAdmin
      .from("profiles")
      .select("id, name, employee_id")
      .eq("approval_status", "approved")
      .eq("is_active", true),
  ]);

  const reports = (reportsRes.data ?? []) as ReportRow[];
  const agentRows = agentsRes.data ?? [];
  const agentById = new Map(agentRows.map((a) => [a.id, a]));

  const leadIds = [...new Set(reports.map((r) => r.lead_id).filter(Boolean))] as string[];
  const { data: leadRows } = leadIds.length
    ? await supabaseAdmin.from("leads").select("id, name, phone_number").in("id", leadIds)
    : { data: [] as { id: string; name: string; phone_number: string }[] };
  const leadById = new Map((leadRows ?? []).map((l) => [l.id, l]));

  const callById = new Map<string, BriefCall>(
    reports.map((r) => {
      const lead = r.lead_id ? leadById.get(r.lead_id) : undefined;
      const seconds = r.duration_seconds ?? 0;
      return [
        r.id,
        {
          id: r.id,
          agentName: (r.agent_id && agentById.get(r.agent_id)?.name) || "এজেন্ট",
          leadName: lead?.name ?? "লিড",
          phone: lead?.phone_number ?? r.phone_number ?? "—",
          fromLabel: clock(r.call_started_at ?? r.call_ended_at),
          toLabel: clock(r.call_ended_at),
          talkSeconds: seconds,
          talkLabel: talkLabel(seconds),
          connected: r.connected,
          category: r.category ?? "",
          categoryLabel: CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—",
          temperature: r.temperature,
          grade: r.grade,
          summary: (r.summary ?? r.note ?? "").trim(),
          followUpLabel: r.follow_up_at
            ? `${dayLabel(r.follow_up_at)} ${clock(r.follow_up_at)}`
            : null,
        } satisfies BriefCall,
      ];
    }),
  );

  const byAgent = new Map<string, BriefAgent>();
  for (const r of reports) {
    const id = r.agent_id ?? "unknown";
    const profile = r.agent_id ? agentById.get(r.agent_id) : undefined;
    const line =
      byAgent.get(id) ??
      ({
        agentId: id,
        name: profile?.name ?? "এজেন্ট",
        employeeId: profile?.employee_id ?? null,
        calls: 0,
        connected: 0,
        talkSeconds: 0,
        talkLabel: "0 সে",
        hot: 0,
        warm: 0,
        cold: 0,
        followUps: 0,
        categories: [],
        bestCategory: null,
        calls_detail: [],
      } satisfies BriefAgent);
    line.calls += 1;
    if (r.connected) line.connected += 1;
    line.talkSeconds += r.duration_seconds ?? 0;
    if (r.temperature === "hot") line.hot += 1;
    if (r.temperature === "warm") line.warm += 1;
    if (r.temperature === "cold") line.cold += 1;
    if (r.follow_up_at) line.followUps += 1;
    const detail = callById.get(r.id);
    if (detail) line.calls_detail.push(detail);
    byAgent.set(id, line);
  }

  const categoryTotals = new Map<string, number>();
  for (const r of reports) {
    const label = CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—";
    categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + 1);
  }

  const agents = [...byAgent.values()].map((line) => {
    const own = new Map<string, number>();
    for (const call of line.calls_detail) {
      own.set(call.categoryLabel, (own.get(call.categoryLabel) ?? 0) + 1);
    }
    const ordered = [...own.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
    return {
      ...line,
      talkLabel: talkLabel(line.talkSeconds),
      categories: ordered,
      bestCategory: ordered[0]?.label ?? null,
    };
  });
  agents.sort((a, b) => b.connected - a.connected || b.talkSeconds - a.talkSeconds);

  const hourMap = new Map<number, { calls: number; connected: number; seconds: number }>();
  for (const r of reports) {
    const dhakaHour = new Date(
      new Date(r.call_ended_at).getTime() + 6 * 60 * 60 * 1000,
    ).getUTCHours();
    const bucket = hourMap.get(dhakaHour) ?? { calls: 0, connected: 0, seconds: 0 };
    bucket.calls += 1;
    if (r.connected) bucket.connected += 1;
    bucket.seconds += r.duration_seconds ?? 0;
    hourMap.set(dhakaHour, bucket);
  }
  const hourly = [...hourMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, value]) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      calls: value.calls,
      connected: value.connected,
      minutes: Math.round(value.seconds / 60),
    }));

  const talkSeconds = reports.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
  const connectedCount = reports.filter((r) => r.connected).length;
  const totals = {
    agentsWorking: agents.length,
    calls: reports.length,
    connected: connectedCount,
    talkSeconds,
    talkLabel: talkLabel(talkSeconds),
    hot: reports.filter((r) => r.temperature === "hot").length,
    warm: reports.filter((r) => r.temperature === "warm").length,
    cold: reports.filter((r) => r.temperature === "cold").length,
    followUps: reports.filter((r) => r.follow_up_at).length,
    conversations: connectedCount,
  };

  const categories = [...categoryTotals.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // Lead-based summary: one line per lead, built from the agents' own updates.
  const leadMap = new Map<string, BriefLead>();
  for (const r of reports) {
    const key = r.lead_id ?? `phone:${r.phone_number ?? r.id}`;
    const lead = r.lead_id ? leadById.get(r.lead_id) : undefined;
    const seconds = r.duration_seconds ?? 0;
    const existing = leadMap.get(key);
    const agentName = (r.agent_id && agentById.get(r.agent_id)?.name) || "এজেন্ট";
    const followUp = r.follow_up_at ? `${dayLabel(r.follow_up_at)} ${clock(r.follow_up_at)}` : null;
    if (!existing) {
      leadMap.set(key, {
        leadId: key,
        name: lead?.name ?? "লিড",
        phone: lead?.phone_number ?? r.phone_number ?? "—",
        calls: 1,
        connected: r.connected,
        talkSeconds: seconds,
        talkLabel: talkLabel(seconds),
        lastTalkLabel: talkLabel(seconds),
        lastFromLabel: clock(r.call_started_at ?? r.call_ended_at),
        lastToLabel: clock(r.call_ended_at),
        categoryLabel: CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—",
        temperature: r.temperature,
        grade: r.grade,
        summary: (r.summary ?? r.note ?? "").trim(),
        followUpLabel: followUp,
        lastAgentName: agentName,
      });
      continue;
    }
    existing.calls += 1;
    existing.connected = existing.connected || r.connected;
    existing.talkSeconds += seconds;
    existing.talkLabel = talkLabel(existing.talkSeconds);
    // Reports arrive ordered by call_ended_at, so the latest update wins.
    existing.lastTalkLabel = talkLabel(seconds);
    existing.lastFromLabel = clock(r.call_started_at ?? r.call_ended_at);
    existing.lastToLabel = clock(r.call_ended_at);
    existing.categoryLabel = CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—";
    existing.temperature = r.temperature ?? existing.temperature;
    existing.grade = r.grade ?? existing.grade;
    const text = (r.summary ?? r.note ?? "").trim();
    if (text) existing.summary = text;
    if (followUp) existing.followUpLabel = followUp;
    existing.lastAgentName = agentName;
  }
  const leads = [...leadMap.values()].sort((a, b) => b.talkSeconds - a.talkSeconds);

  return {
    label,
    live,
    fromLabel: clock(startIso),
    toLabel: clock(endIso),
    totals,
    hourly,
    categories,
    agents,
    leads,
    narrative: narrate(label, totals, agents, categories, hourly, live),
  };
}

/** Plain-language Bengali discussion text built from the same numbers. */
function narrate(
  label: string,
  totals: BriefBlock["totals"],
  agents: BriefAgent[],
  categories: { label: string; count: number }[],
  hourly: BriefBlock["hourly"],
  live: boolean,
): string[] {
  if (totals.calls === 0) {
    return [
      `${label}-এ এখন পর্যন্ত এজেন্টদের কোনো আপডেট এসে পৌঁছায়নি।`,
      live
        ? "এজেন্টরা আপডেট জমা দিলেই এই প্রেজেন্টেশন নিজে থেকেই ভরে উঠবে।"
        : "এই উইন্ডোতে জমা পড়া আপডেট থেকেই পরবর্তী প্রেজেন্টেশন তৈরি হবে।",
    ];
  }

  const lines: string[] = [];
  const rate = Math.round((totals.connected / totals.calls) * 100);
  lines.push(
    `${label}-এ ${totals.agentsWorking} জন এজেন্ট মিলিয়ে ${totals.calls}টি কল করেছেন, তার ${totals.connected}টিতে ক্রেতার সঙ্গে সত্যিকারের কথা হয়েছে (${rate}%) — মোট কথার সময় ${totals.talkLabel}।`,
  );

  const top = agents[0];
  if (top) {
    lines.push(
      `সবচেয়ে এগিয়ে ${top.name} — ${top.connected}টি কথা, কথার সময় ${top.talkLabel}${
        top.bestCategory ? `, বেশিরভাগই ${top.bestCategory}` : ""
      }।`,
    );
  }
  const runnerUp = agents[1];
  if (runnerUp) {
    lines.push(`এরপরে ${runnerUp.name} — ${runnerUp.connected}টি কথা, ${runnerUp.talkLabel}।`);
  }

  const busiest = [...hourly].sort((a, b) => b.calls - a.calls)[0];
  if (busiest) {
    lines.push(
      `সবচেয়ে ব্যস্ত সময় ${busiest.hour}-এর ঘণ্টা — ${busiest.calls}টি কল, ${busiest.minutes} মিনিট কথা।`,
    );
  }

  if (categories[0]) {
    const rest = categories
      .slice(1, 3)
      .map((c) => `${c.label} ${c.count}`)
      .join(", ");
    lines.push(
      `আলোচনার ধরন: সবচেয়ে বেশি ${categories[0].label} (${categories[0].count})${rest ? `, এরপর ${rest}` : ""}।`,
    );
  }

  lines.push(
    `শ্রেণিবিন্যাস: HOT ${totals.hot}, WARM ${totals.warm}, COLD ${totals.cold} — পরবর্তী ধাপের জন্য ${totals.followUps}টি ফলো-আপ সময় ঠিক করা আছে।`,
  );

  if (live) {
    lines.push("এই উইন্ডো চলমান — নতুন আপডেট আসার সঙ্গে সঙ্গেই উপরের হিসাব বদলে যাবে।");
  }

  return lines;
}

/** The presentation Executive HQ should be looking at right now. */
export async function executiveBriefNow(at: Date = new Date()): Promise<ExecutiveBriefResult> {
  const { minutes, dateKey } = dhakaParts(at);
  const generatedAtLabel = at.toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });

  // Before 08:50 → yesterday's full day stays on screen.
  if (minutes < NEXT_MORNING) {
    const yesterday = dhakaParts(new Date(at.getTime() - 24 * 60 * 60 * 1000)).dateKey;
    const main = await loadBlock(
      `${dayLabel(dhakaInstant(yesterday, DAY_START).toISOString())} — পুরো দিনের রিপোর্ট`,
      false,
      dhakaInstant(yesterday, DAY_START),
      dhakaInstant(yesterday, DAY_END),
    );
    return {
      generatedAtLabel,
      windowKind: "previous_day",
      headline: "গতকালের পূর্ণ দিনের প্রেজেন্টেশন",
      subline: "সকাল ৮:৫০-এ আজকের সকালের শিফট শুরু হলে এটি নতুন রিপোর্টে বদলে যাবে।",
      main,
      liveAddon: null,
    };
  }

  // 08:50 – 12:49 → morning shift, live.
  if (minutes < MORNING_REPORT) {
    const main = await loadBlock(
      "সকালের শিফট (৯:০০–১২:৪৫)",
      true,
      dhakaInstant(dateKey, DAY_START),
      at,
    );
    return {
      generatedAtLabel,
      windowKind: "morning_live",
      headline: "সকালের শিফট — লাইভ প্রেজেন্টেশন",
      subline: "১২:৫০-এ এই শিফটের পূর্ণ রিপোর্ট তৈরি হবে।",
      main,
      liveAddon: null,
    };
  }

  // 12:50 – 17:29 → the 12:50 report, plus the afternoon syncing in live.
  if (minutes < DAY_REPORT) {
    const main = await loadBlock(
      "১২:৫০-এর রিপোর্ট · সকালের শিফট (৯:০০–১২:৪৫)",
      false,
      dhakaInstant(dateKey, DAY_START),
      dhakaInstant(dateKey, MORNING_END),
    );
    const liveAddon = await loadBlock(
      "বিকেলের শিফট — চলমান লাইভ সিঙ্ক",
      true,
      dhakaInstant(dateKey, MORNING_END),
      at,
    );
    return {
      generatedAtLabel,
      windowKind: "midday_report",
      headline: "১২:৫০-এর রিপোর্ট",
      subline: "৫:৩০-এ পুরো দিনের প্রেজেন্টেশন আসবে; ততক্ষণ বিকেলের আপডেট নিচে লাইভ যোগ হচ্ছে।",
      main,
      liveAddon,
    };
  }

  // 17:30 onward → full day, shown until 08:50 tomorrow.
  const end = minutes > DAY_END ? at : dhakaInstant(dateKey, DAY_END);
  const main = await loadBlock(
    `${dayLabel(at.toISOString())} — পুরো দিনের রিপোর্ট`,
    false,
    dhakaInstant(dateKey, DAY_START),
    end,
  );
  return {
    generatedAtLabel,
    windowKind: "day_report",
    headline: "৫:৩০-এর পূর্ণ দিনের প্রেজেন্টেশন",
    subline: "আগামীকাল সকাল ৮:৫০ পর্যন্ত এই রিপোর্টই দেখা যাবে।",
    main,
    liveAddon: null,
  };
}
