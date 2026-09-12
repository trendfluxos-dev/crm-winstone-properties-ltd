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

/** Maps a parsed grid to lead rows; drops rows without a name or a usable number. */
export function toLeadRows(grid: string[][]): CsvLeadRow[] {
  if (!grid.length) return [];
  const header = grid[0]!.map((h) => h.trim().toLowerCase());
  const col = (key: keyof CsvLeadRow) => header.findIndex((h) => HEADER_ALIASES[key].includes(h));
  let nameIdx = col("name");
  let phoneIdx = col("phone_number");
  const companyIdx = col("company");
  const notesIdx = col("notes");
  let body = grid.slice(1);
  // No header row? Assume "name, phone[, company[, notes]]".
  if (nameIdx === -1 || phoneIdx === -1) {
    nameIdx = 0;
    phoneIdx = 1;
    body = grid;
  }
  return body
    .map((r) => ({
      name: (r[nameIdx] ?? "").trim(),
      phone_number: (r[phoneIdx] ?? "").trim(),
      company: companyIdx >= 0 ? (r[companyIdx] ?? "").trim() || null : (r[2] ?? "").trim() || null,
      notes: notesIdx >= 0 ? (r[notesIdx] ?? "").trim() || null : null,
    }))
    .filter((r) => r.name && r.phone_number.replace(/\D/g, "").length >= 6);
}

/** A small realistic Bangladesh sample file used to try the import flow. */
export const DEMO_CSV = `name,phone,company,notes
রফিকুল ইসলাম,01712345601,রফিক ট্রেডার্স,আগে একবার দাম জেনেছেন
Satera Traders,01812345602,Satera Traders,পুরনো ক্রেতা — রিঅর্ডার সম্ভাবনা
নাসরিন আক্তার,+8801912345603,নাসরিন এন্টারপ্রাইজ,সকাল ১১টার পরে ফোন করতে বলেছেন
Hasan Mia,8801612345604,,ছোট দোকান — কম পরিমাণে নেবেন
মুনিরা বেগম,01512345605,মুনিরা স্টোর,ইনভয়েস কপি চেয়েছেন
`;
