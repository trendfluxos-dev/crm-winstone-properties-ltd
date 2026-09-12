/**
 * IT Console report sheet: turns submitted call reports into spreadsheet rows,
 * and pushes new rows into the workspace Google Sheet through the Lovable
 * connector gateway (server-only credentials).
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SHEET_ID = "1cS2BH_T9USf7lbVfKMWGi18EV53y1jDGqENzkNTiG7s";
const TAB = "Call Reports";
const CONFIG_ID = "report_sheet_sync";

export const REPORT_SHEET_HEADER = [
  "তারিখ ও সময়",
  "এজেন্ট",
  "লিড",
  "ফোন",
  "ক্যাটাগরি",
  "সংযুক্ত",
  "সময়কাল (সেকেন্ড)",
  "সারাংশ",
  "নোট",
  "ফলো-আপ",
] as const;

export type ReportSheetRow = {
  id: string;
  callEndedAt: string;
  agentName: string;
  leadName: string;
  phone: string;
  category: string;
  connected: boolean;
  durationSeconds: number;
  summary: string;
  note: string;
  followUpAt: string | null;
};

export const CATEGORY_LABEL: Record<string, string> = {
  hot_lead: "HOT LEAD",
  follow_up: "FOLLOW UP",
  interested: "INTERESTED",
  not_interested: "NOT INTERESTED",
  callback: "CALLBACK",
  no_answer: "NO ANSWER",
  wrong_number: "WRONG NUMBER",
  closed_converted: "CLOSED / CONVERTED",
};

/** Submitted call reports, newest first, flattened for spreadsheet use. */
export async function fetchReportSheetRows(limit = 200): Promise<ReportSheetRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("call_reports")
    .select(
      "id, agent_id, lead_id, phone_number, category, connected, duration_seconds, summary, note, follow_up_at, call_ended_at, submitted_at, status",
    )
    .eq("status", "submitted")
    .order("call_ended_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const agentIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))] as string[];
  const leadIds = [...new Set(rows.map((r) => r.lead_id).filter(Boolean))] as string[];

  const [agents, leads] = await Promise.all([
    agentIds.length
      ? supabaseAdmin.from("profiles").select("id, name").in("id", agentIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    leadIds.length
      ? supabaseAdmin.from("leads").select("id, name, phone_number").in("id", leadIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone_number: string }[] }),
  ]);

  const agentName = new Map((agents.data ?? []).map((a) => [a.id, a.name]));
  const lead = new Map((leads.data ?? []).map((l) => [l.id, l]));

  return rows.map((r) => ({
    id: r.id,
    callEndedAt: r.call_ended_at ?? r.submitted_at ?? new Date().toISOString(),
    agentName: (r.agent_id && agentName.get(r.agent_id)) || "—",
    leadName: (r.lead_id && lead.get(r.lead_id)?.name) || "—",
    phone: r.phone_number ?? (r.lead_id ? lead.get(r.lead_id)?.phone_number ?? "" : ""),
    category: CATEGORY_LABEL[r.category ?? ""] ?? r.category ?? "—",
    connected: Boolean(r.connected),
    durationSeconds: r.duration_seconds ?? 0,
    summary: r.summary ?? "",
    note: r.note ?? "",
    followUpAt: r.follow_up_at ?? null,
  }));
}

function formatDhaka(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
}

function toSheetLine(row: ReportSheetRow) {
  return [
    formatDhaka(row.callEndedAt),
    row.agentName,
    row.leadName,
    row.phone,
    row.category,
    row.connected ? "হ্যাঁ" : "না",
    String(row.durationSeconds),
    row.summary,
    row.note,
    formatDhaka(row.followUpAt),
  ];
}

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["GOOGLE_SHEETS_API_KEY"];
  if (!lovableKey || !connectionKey) {
    throw new Error("Google Sheets সংযোগ কনফিগার করা নেই");
  }
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

async function gatewayFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: { ...gatewayHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Sheets gateway failed [${response.status}]: ${body}`);
    throw new Error(`Google Sheets ত্রুটি [${response.status}]: ${body.slice(0, 300)}`);
  }
  return body ? (JSON.parse(body) as unknown) : null;
}

async function ensureTab() {
  const meta = (await gatewayFetch(
    `/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`,
  )) as { sheets?: { properties?: { title?: string } }[] } | null;
  const exists = (meta?.sheets ?? []).some((s) => s.properties?.title === TAB);
  if (exists) return;

  await gatewayFetch(`/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
  });
  await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${TAB}!A1:J1?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: [[...REPORT_SHEET_HEADER]] }) },
  );
}

/**
 * Appends every submitted report that has not been pushed yet. Keeps the last
 * synced report timestamp in public.app_config so repeat runs stay idempotent.
 */
export async function syncReportsToSheet() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: config } = await supabaseAdmin
    .from("app_config")
    .select("data")
    .eq("id", CONFIG_ID)
    .maybeSingle();
  const state = (config?.data ?? {}) as { syncedIds?: string[]; lastSyncedAt?: string };
  const synced = new Set(state.syncedIds ?? []);

  const rows = await fetchReportSheetRows(500);
  const fresh = rows.filter((r) => !synced.has(r.id)).reverse();
  if (fresh.length === 0) {
    return { appended: 0, sheetUrl: reportSheetUrl(), lastSyncedAt: state.lastSyncedAt ?? null };
  }

  await ensureTab();
  await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${TAB}!A1:J1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: fresh.map(toSheetLine) }) },
  );

  const lastSyncedAt = new Date().toISOString();
  const keptIds = [...synced, ...fresh.map((r) => r.id)].slice(-2000);
  await supabaseAdmin
    .from("app_config")
    .upsert({ id: CONFIG_ID, data: { syncedIds: keptIds, lastSyncedAt }, updated_at: lastSyncedAt });

  return { appended: fresh.length, sheetUrl: reportSheetUrl(), lastSyncedAt };
}

export function reportSheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
}

export async function readSyncState() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_config")
    .select("data")
    .eq("id", CONFIG_ID)
    .maybeSingle();
  const state = (data?.data ?? {}) as { lastSyncedAt?: string; syncedIds?: string[] };
  return { lastSyncedAt: state.lastSyncedAt ?? null, syncedCount: (state.syncedIds ?? []).length };
}
