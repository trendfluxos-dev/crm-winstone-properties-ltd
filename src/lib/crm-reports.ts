import {
  CONNECTED_THRESHOLD_SECONDS,
  type CallRecording,
  type Lead,
  type LeadStatus,
  type Profile,
  type WhatsappMessage,
} from "@/lib/crm-data";

export type ReportFilters = {
  /** inclusive yyyy-mm-dd */
  from: string;
  /** inclusive yyyy-mm-dd */
  to: string;
  agentId: string | "all";
  source: string | "all";
  status: LeadStatus | "all";
};

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function defaultFilters(days = 30, ref = new Date()): ReportFilters {
  const from = new Date(ref);
  from.setDate(from.getDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(ref), agentId: "all", source: "all", status: "all" };
}

function dayKeys(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const keys: string[] = [];
  for (let d = new Date(start); d <= end && keys.length < 400; d.setDate(d.getDate() + 1)) {
    keys.push(isoDay(d));
  }
  return keys;
}

function inRange(iso: string, from: string, to: string): boolean {
  const day = isoDay(new Date(iso));
  return day >= from && day <= to;
}

export type DailyPoint = {
  date: string;
  label: string;
  dials: number;
  connected: number;
  talkMinutes: number;
  whatsapp: number;
  newLeads: number;
};

export type ReportRow = {
  agentId: string;
  agent: string;
  employeeId: string;
  dials: number;
  connected: number;
  connectRate: number;
  talkMinutes: number;
  avgCallSeconds: number;
  whatsapp: number;
  assigned: number;
  dealsWon: number;
  conversionRate: number;
};

export type ReportResult = {
  filters: ReportFilters;
  totals: {
    dials: number;
    connected: number;
    connectRate: number;
    talkMinutes: number;
    whatsapp: number;
    newLeads: number;
    dealsWon: number;
    activeAgents: number;
  };
  daily: DailyPoint[];
  statusMix: { key: string; label: string; value: number }[];
  sourceMix: { key: string; label: string; value: number }[];
  sentimentMix: { key: string; label: string; value: number }[];
  rows: ReportRow[];
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  contacted: "Contacted",
  follow_up: "Follow-up",
  closed: "Closed",
};

function titleize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pure aggregation shared by the web reports screen and the Android reports endpoint. */
export function buildReport(
  data: {
    profiles: Profile[];
    leads: Lead[];
    calls: CallRecording[];
    messages: WhatsappMessage[];
  },
  filters: ReportFilters,
): ReportResult {
  const { from, to, agentId, source, status } = filters;

  const agents = data.profiles.filter((p) => p.role === "agent" || p.role === "team_leader");
  const scopedAgents = agentId === "all" ? agents : agents.filter((a) => a.id === agentId);
  const agentIds = new Set(scopedAgents.map((a) => a.id));

  const leads = data.leads.filter(
    (l) =>
      (source === "all" || l.source === source) &&
      (status === "all" || l.status === status) &&
      (agentId === "all" || l.assigned_to === agentId),
  );
  const leadIds = new Set(leads.map((l) => l.id));

  const scopeCall = (c: CallRecording) =>
    inRange(c.created_at, from, to) &&
    (agentId === "all" || c.agent_id === agentId) &&
    (source === "all" && status === "all" ? true : c.lead_id !== null && leadIds.has(c.lead_id));

  const scopeMessage = (m: WhatsappMessage) =>
    inRange(m.created_at, from, to) &&
    m.sender_type === "agent" &&
    (agentId === "all" || m.agent_id === agentId) &&
    (source === "all" && status === "all" ? true : m.lead_id !== null && leadIds.has(m.lead_id));

  const calls = data.calls.filter(scopeCall);
  const messages = data.messages.filter(scopeMessage);
  const newLeads = leads.filter((l) => inRange(l.created_at, from, to));

  const buckets = new Map<string, DailyPoint>();
  for (const key of dayKeys(from, to)) {
    buckets.set(key, {
      date: key,
      label: new Date(`${key}T00:00:00`).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
      }),
      dials: 0,
      connected: 0,
      talkMinutes: 0,
      whatsapp: 0,
      newLeads: 0,
    });
  }
  for (const c of calls) {
    const b = buckets.get(isoDay(new Date(c.created_at)));
    if (!b) continue;
    b.dials += 1;
    if (c.duration_seconds > CONNECTED_THRESHOLD_SECONDS) b.connected += 1;
    b.talkMinutes += c.duration_seconds / 60;
  }
  for (const m of messages) {
    const b = buckets.get(isoDay(new Date(m.created_at)));
    if (b) b.whatsapp += 1;
  }
  for (const l of newLeads) {
    const b = buckets.get(isoDay(new Date(l.created_at)));
    if (b) b.newLeads += 1;
  }
  const daily = [...buckets.values()].map((b) => ({
    ...b,
    talkMinutes: Math.round(b.talkMinutes * 10) / 10,
  }));

  const countBy = <T>(items: T[], pick: (item: T) => string | null) => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = pick(item);
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({ key, label: STATUS_LABEL[key] ?? titleize(key), value }));
  };

  const rows: ReportRow[] = scopedAgents
    .map((profile) => {
      const agentCalls = calls.filter((c) => c.agent_id === profile.id);
      const connected = agentCalls.filter(
        (c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS,
      ).length;
      const talkSeconds = agentCalls.reduce((s, c) => s + c.duration_seconds, 0);
      const assignedLeads = leads.filter((l) => l.assigned_to === profile.id);
      const dealsWon = assignedLeads.filter(
        (l) => l.status === "closed" && l.outcome_category === "deal_won",
      ).length;
      return {
        agentId: profile.id,
        agent: profile.name,
        employeeId: profile.employee_id ?? "—",
        dials: agentCalls.length,
        connected,
        connectRate: agentCalls.length ? (connected / agentCalls.length) * 100 : 0,
        talkMinutes: Math.round((talkSeconds / 60) * 10) / 10,
        avgCallSeconds: connected ? Math.round(talkSeconds / connected) : 0,
        whatsapp: messages.filter((m) => m.agent_id === profile.id).length,
        assigned: assignedLeads.length,
        dealsWon,
        conversionRate: assignedLeads.length ? (dealsWon / assignedLeads.length) * 100 : 0,
      };
    })
    .sort((a, b) => b.connected - a.connected || b.talkMinutes - a.talkMinutes);

  const totalConnected = calls.filter(
    (c) => c.duration_seconds > CONNECTED_THRESHOLD_SECONDS,
  ).length;

  return {
    filters,
    totals: {
      dials: calls.length,
      connected: totalConnected,
      connectRate: calls.length ? (totalConnected / calls.length) * 100 : 0,
      talkMinutes: Math.round((calls.reduce((s, c) => s + c.duration_seconds, 0) / 60) * 10) / 10,
      whatsapp: messages.length,
      newLeads: newLeads.length,
      dealsWon: leads.filter((l) => l.status === "closed" && l.outcome_category === "deal_won")
        .length,
      activeAgents: scopedAgents.filter((a) => a.is_active).length,
    },
    daily,
    statusMix: countBy(leads, (l) => l.status),
    sourceMix: countBy(leads, (l) => l.source),
    sentimentMix: countBy(calls, (c) => c.sentiment),
    rows,
  };
}

export function leadSources(leads: Lead[]): string[] {
  return [...new Set(leads.map((l) => l.source))].sort();
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // Spreadsheet programs execute cells beginning with these characters as formulas.
  // Prefix even when whitespace/control characters precede the formula marker.
  if (/^[\t\r]|^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function reportToCsv(report: ReportResult): string {
  const f = report.filters;
  const blocks: string[] = [];
  blocks.push(
    toCsv(
      ["Report", "From", "To", "Agent", "Source", "Status"],
      [["Winstone Connect performance", f.from, f.to, f.agentId, f.source, f.status]],
    ),
  );
  blocks.push(
    toCsv(
      ["Metric", "Value"],
      [
        ["Dials", report.totals.dials],
        ["Connected", report.totals.connected],
        ["Connect rate %", report.totals.connectRate.toFixed(1)],
        ["Talk minutes", report.totals.talkMinutes],
        ["WhatsApp touches", report.totals.whatsapp],
        ["New leads", report.totals.newLeads],
        ["Deals won", report.totals.dealsWon],
      ],
    ),
  );
  blocks.push(
    toCsv(
      ["Date", "Dials", "Connected", "Talk minutes", "WhatsApp", "New leads"],
      report.daily.map((d) => [d.date, d.dials, d.connected, d.talkMinutes, d.whatsapp, d.newLeads]),
    ),
  );
  blocks.push(
    toCsv(
      [
        "Agent",
        "Employee ID",
        "Dials",
        "Connected",
        "Connect rate %",
        "Talk minutes",
        "Avg call (s)",
        "WhatsApp",
        "Assigned leads",
        "Deals won",
        "Conversion %",
      ],
      report.rows.map((r) => [
        r.agent,
        r.employeeId,
        r.dials,
        r.connected,
        r.connectRate.toFixed(1),
        r.talkMinutes,
        r.avgCallSeconds,
        r.whatsapp,
        r.assigned,
        r.dealsWon,
        r.conversionRate.toFixed(1),
      ]),
    ),
  );
  blocks.push(
    toCsv(
      ["Lead status", "Leads"],
      report.statusMix.map((s) => [s.label, s.value]),
    ),
  );
  blocks.push(
    toCsv(
      ["Lead source", "Leads"],
      report.sourceMix.map((s) => [s.label, s.value]),
    ),
  );
  return blocks.join("\r\n\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
