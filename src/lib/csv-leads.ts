/**
 * Shared CSV -> lead row parsing for the import screen and the coordinator
 * import dialog, so both read exactly the same files the same way.
 */

export type CsvLeadRow = {
  name: string;
  phone_number: string;
  company?: string | null;
  notes?: string | null;
};

/** Minimal RFC-4180-ish CSV parser (handles quoted fields and commas inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

const HEADER_ALIASES: Record<keyof CsvLeadRow, string[]> = {
  name: ["name", "customer", "customer name", "lead", "lead name", "নাম"],
  phone_number: ["phone", "phone number", "phone_number", "mobile", "number", "contact", "ফোন"],
  company: ["company", "organisation", "organization", "business", "shop", "প্রতিষ্ঠান"],
  notes: ["notes", "note", "remarks", "comment", "comments", "মন্তব্য"],
};

/** Extra columns kept as readable note lines so nothing from the sheet is lost. */
const EXTRA_ALIASES: { label: string; names: string[] }[] = [
  { label: "পেশা", names: ["profession", "designation", "title", "occupation"] },
  { label: "ঠিকানা", names: ["address", "location", "area"] },
  { label: "ইমেইল", names: ["email", "e-mail", "mail"] },
  { label: "সূত্র", names: ["sources", "source", "source file"] },
  { label: "Lead ID", names: ["lead id", "lead_id", "id", "serial", "sl"] },
];

/**
 * Pulls the first usable Bangladeshi mobile number out of a messy cell such as
 * "Mobile: 01730-733966, Tel: 09 666 777 177" or "+88 01711 308876".
 */
export function extractPhone(raw: string): string | null {
  const compact = raw.replace(/[\s()\-.]/g, "");
  const mobile = compact.match(/(?:\+?88)?0?1[3-9]\d{8}/);
  if (mobile) {
    const digits = mobile[0].replace(/\D/g, "");
    return `0${digits.slice(-10)}`;
  }
  const any = compact.match(/\+?\d{9,15}/);
  return any ? any[0] : null;
}

/** Trims a cell and treats sheet placeholders ("—", "---") as empty. */
function cleanCell(value: string | undefined): string | null {
  const text = (value ?? "").trim();
  if (!text || text === "—" || /^[-–—]+$/.test(text)) return null;
  return text;
}

export type ImportStats = {


  total: number;
  usable: number;
  noPhone: number;
  duplicateInFile: number;
};

/** Maps a parsed grid to lead rows; drops rows without a name or a usable number. */
export function toLeadRows(grid: string[][]): CsvLeadRow[] {
  return analyzeGrid(grid).rows;
}

/** Same mapping as toLeadRows, but also reports what was dropped and why. */
export function analyzeGrid(grid: string[][]): { rows: CsvLeadRow[]; stats: ImportStats } {
  const empty: ImportStats = { total: 0, usable: 0, noPhone: 0, duplicateInFile: 0 };
  if (!grid.length) return { rows: [], stats: empty };

  const header = grid[0]!.map((h) => h.trim().toLowerCase().replace(/^\uFEFF/, ""));
  const col = (key: keyof CsvLeadRow) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  let nameIdx = col("name");
  let phoneIdx = col("phone_number");
  const companyIdx = col("company");
  const notesIdx = col("notes");
  const extras = EXTRA_ALIASES.map((extra) => ({
    label: extra.label,
    index: header.findIndex((h) => extra.names.includes(h)),
  })).filter((extra) => extra.index >= 0);

  let body = grid.slice(1);
  // No header row? Assume "name, phone[, company[, notes]]".
  if (nameIdx === -1 || phoneIdx === -1) {
    nameIdx = 0;
    phoneIdx = 1;
    body = grid;
    extras.length = 0;
  }

  const rows: CsvLeadRow[] = [];
  const stats: ImportStats = { ...empty, total: body.length };
  const seen = new Set<string>();

  for (const r of body) {
    const name = (r[nameIdx] ?? "").trim();
    const phone = extractPhone((r[phoneIdx] ?? "").trim());
    if (!name || !phone) {
      stats.noPhone += 1;
      continue;
    }
    if (seen.has(phone)) {
      stats.duplicateInFile += 1;
      continue;
    }
    seen.add(phone);

    const noteLines = extras
      .map((extra) => {
        const value = (r[extra.index] ?? "").trim();
        return value && value !== "—" && !/^-+$/.test(value) ? `${extra.label}: ${value}` : null;
      })
      .filter(Boolean) as string[];
    const ownNote = notesIdx >= 0 ? (r[notesIdx] ?? "").trim() : "";
    if (ownNote) noteLines.unshift(ownNote);

    rows.push({
      name,
      phone_number: phone,
      company: companyIdx >= 0 ? cleanCell(r[companyIdx]) : null,
      notes: noteLines.length ? noteLines.join("\n").slice(0, 2000) : null,
    });
  }

  stats.usable = rows.length;
  return { rows, stats };
}


/** A small realistic Bangladesh sample file used to try the import flow. */
export const DEMO_CSV = `name,phone,company,notes
রফিকুল ইসলাম,01712345601,রফিক ট্রেডার্স,আগে একবার দাম জেনেছেন
Satera Traders,01812345602,Satera Traders,পুরনো ক্রেতা — রিঅর্ডার সম্ভাবনা
নাসরিন আক্তার,+8801912345603,নাসরিন এন্টারপ্রাইজ,সকাল ১১টার পরে ফোন করতে বলেছেন
Hasan Mia,8801612345604,,ছোট দোকান — কম পরিমাণে নেবেন
মুনিরা বেগম,01512345605,মুনিরা স্টোর,ইনভয়েস কপি চেয়েছেন
`;
