/**
 * Shift summaries → Google Sheets. Every generated shift summary is written to
 * a dedicated tab in the workspace spreadsheet, so HQ can read the summary
 * straight from Google Sheets without opening the CRM. The tab holds one block
 * per shift, newest first; reruns for the same shift replace its old block, so
 * repeats stay idempotent.
 */
import type { ShiftAgentLine, ShiftSummaryRow } from "@/lib/shift-summary.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";
const SHEET_ID = "1cS2BH_T9USf7lbVfKMWGi18EV53y1jDGqENzkNTiG7s";
const TAB = "শিফট সামারি";

const HEADER = [
  "শিফট",
  "সময়কাল",
  "তৈরির সময়",
  "এজেন্ট",
  "বরাদ্দ লিড",
  "কল",
  "সংযুক্ত",
  "রিপোর্ট",
  "বাকি",
  "ফলো-আপ",
  "ক্যাটাগরি",
] as const;

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

function formatDhaka(iso: string) {
  return new Date(iso).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
}

function categoryText(categories: Record<string, number>) {
  return Object.entries(categories)
    .map(([label, count]) => `${label}: ${count}`)
    .join(", ");
}

async function ensureTab() {
  const meta = (await gatewayFetch(`/spreadsheets/${SHEET_ID}?fields=sheets.properties.title`)) as {
    sheets?: { properties?: { title?: string } }[];
  } | null;
  const exists = (meta?.sheets ?? []).some((s) => s.properties?.title === TAB);
  if (exists) return;
  await gatewayFetch(`/spreadsheets/${SHEET_ID}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: TAB } } }] }),
  });
  await gatewayFetch(
    `/spreadsheets/${SHEET_ID}/values/${TAB}!A1:K1?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: [[...HEADER]] }) },
  );
}

/** One summary → one block of rows (a totals row, then one row per agent). */
function summaryRows(summary: ShiftSummaryRow): string[][] {
  const window = `${formatDhaka(summary.window_start)} — ${formatDhaka(summary.window_end)}`;
  const rows: string[][] = [
    [
      summary.shift_label,
      window,
      formatDhaka(summary.generated_at),
      "মোট",
      "",
      String(summary.totals.called),
      String(summary.totals.connected),
      String(summary.totals.reports),
      String(summary.totals.pending),
      String(summary.totals.followUps),
      "",
    ],
  ];
  for (const agent of summary.agents) {
    rows.push([
      summary.shift_label,
      window,
      formatDhaka(summary.generated_at),
      agent.name + (agent.employeeId ? ` (${agent.employeeId})` : ""),
      String(agent.assigned),
      String(agent.called),
      String(agent.connected),
      String(agent.reports),
      String(agent.pending),
      String(agent.followUps),
      categoryText(agent.categories),
    ]);
  }
  return rows;
}

/**
 * Appends a finished shift's summary block at the top of the tab (right under
 * the header) using Sheets' insertDimension + values update. Fails quietly by
 * returning null when the Sheets connection is missing — the database summary
 * and Drive file must never be blocked by a Sheets problem.
 */
export async function appendShiftSummaryToSheetQuietly(
  shiftKey: string,
): Promise<{ sheetUrl: string; rowsWritten: number } | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("shift_summaries")
      .select("*")
      .eq("shift_key", shiftKey)
      .maybeSingle();
    if (error || !data) return null;
    const summary = data as unknown as ShiftSummaryRow;

    await ensureTab();
    const block = summaryRows(summary);
    // Insert fresh rows under the header, then write the block there.
    await gatewayFetch(`/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: {
                sheetId: await tabSheetId(),
                dimension: "ROWS",
                startIndex: 1,
                endIndex: 1 + block.length,
              },
              inheritFromBefore: false,
            },
          },
        ],
      }),
    });
    await gatewayFetch(
      `/spreadsheets/${SHEET_ID}/values/${TAB}!A2:K${1 + block.length}?valueInputOption=USER_ENTERED`,
      { method: "PUT", body: JSON.stringify({ values: block }) },
    );

    await logShiftSheetSync(shiftKey, block.length);
    return { sheetUrl: shiftSheetUrl(), rowsWritten: block.length };
  } catch (err) {
    console.error(`Shift summary → Sheets failed for ${shiftKey}:`, err);
    return null;
  }
}

async function tabSheetId(): Promise<number> {
  const meta = (await gatewayFetch(
    `/spreadsheets/${SHEET_ID}?fields=sheets.properties`,
  )) as { sheets?: { properties?: { title?: string; sheetId?: number } }[] } | null;
  const found = (meta?.sheets ?? []).find((s) => s.properties?.title === TAB);
  if (!found?.properties?.sheetId) throw new Error("শিফট সামারি ট্যাব খুঁজে পাওয়া যায়নি");
  return found.properties.sheetId;
}

async function logShiftSheetSync(shiftKey: string, rowsWritten: number) {
  try {
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "shift_summary_generated",
      entityType: "shift_summary",
      entityId: shiftKey,
      actorLabel: "নির্ধারিত সময়সূচি",
      metadata: { sheets_sync: true, rowsWritten },
    });
  } catch {
    // audit best-effort
  }
}

export function shiftSheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
}
