/**
 * Google Sheet -> CRM lead intake (Phase 1). Reads a workspace Google Sheet
 * through the Lovable connector gateway (server-only credentials) and turns the
 * values grid into the same lead rows the CSV import uses.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const id = match?.[1] ?? trimmed;
  if (!/^[a-zA-Z0-9-_]{20,}$/.test(id)) {
    throw new Error("Google Sheet লিংকটি ঠিক নেই — শিটের পূর্ণ লিংক দিন");
  }
  return id;
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

async function gatewayFetch(path: string) {
  const response = await fetch(`${GATEWAY}${path}`, { headers: gatewayHeaders() });
  const body = await response.text();
  if (!response.ok) {
    console.error(`Sheets gateway failed [${response.status}]: ${body}`);
    if (response.status === 403 || response.status === 404) {
      throw new Error("শিটটি পড়া যায়নি — সংযুক্ত Google অ্যাকাউন্টকে এই শিটের অ্যাক্সেস দিন");
    }
    throw new Error(`Google Sheets ত্রুটি [${response.status}]: ${body.slice(0, 300)}`);
  }
  return body ? (JSON.parse(body) as unknown) : null;
}

/** Tab names in the spreadsheet, in sheet order. */
export async function listSheetTabs(sheetId: string): Promise<string[]> {
  const meta = (await gatewayFetch(`/spreadsheets/${sheetId}?fields=sheets.properties.title`)) as {
    sheets?: { properties?: { title?: string } }[];
  } | null;
  return (meta?.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
}

/** Raw values grid of one tab (first 2000 rows, columns A-H). */
export async function readSheetGrid(sheetId: string, tab: string): Promise<string[][]> {
  const range = `${tab.includes("'") ? tab : `'${tab}'`}!A1:H2000`;
  const payload = (await gatewayFetch(
    `/spreadsheets/${sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`,
  )) as { values?: unknown[][] } | null;
  return (payload?.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

/** Sheet -> reviewable lead rows, using the shared CSV column mapping. */
export async function readSheetLeads(sheetUrl: string, tab?: string | null) {
  const sheetId = parseSheetId(sheetUrl);
  const tabs = await listSheetTabs(sheetId);
  if (tabs.length === 0) throw new Error("এই শিটে কোনো ট্যাব পাওয়া যায়নি");
  const chosen = tab && tabs.includes(tab) ? tab : tabs[0]!;
  const grid = await readSheetGrid(sheetId, chosen);
  const { toLeadRows } = await import("@/lib/csv-leads");
  return { sheetId, tabs, tab: chosen, rows: toLeadRows(grid) };
}
