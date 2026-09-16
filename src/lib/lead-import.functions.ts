import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Lead import for one agent's own account. Whatever the agent has — a CSV
 * export, a Word/Excel sheet, a PDF, or a photo of a handwritten list — is
 * read once by AI into clean rows (serial, name, address, phone, reference by)
 * which the agent reviews before anything is saved. Saving reuses the normal
 * intake path, so imported leads behave exactly like typed ones.
 */

const MAX_BYTES = 8 * 1024 * 1024;

export const ParsedLeadRow = z.object({
  serialNo: z.string().trim().max(40).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  phoneNumber: z.string().trim().min(6).max(30),
  referenceBy: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
export type ParsedLeadRow = z.infer<typeof ParsedLeadRow>;

const ParseInput = z.object({
  adminToken: z.string().nullable().optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  /** Raw file bytes, base64 (no data: prefix). */
  dataBase64: z.string().min(8),
});

const PROMPT = `You extract sales leads from a document supplied by a Bangladeshi sales agent.
Return ONLY a JSON array, no prose, no markdown fence. Each element:
{"serialNo": string|null, "name": string, "address": string|null, "phoneNumber": string, "referenceBy": string|null, "notes": string|null}
Rules:
- One element per person/business. Skip header rows, totals and empty rows.
- phoneNumber: keep Bangladeshi mobile digits as written (e.g. 01712345678). Never invent a number; skip a row that has no number.
- name: if only a business name exists, use it as the name.
- Keep Bengali text in Bengali. Do not translate.
- referenceBy: only if the document states who referred/assigned the lead.
- Never invent data that is not in the document.`;

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

/** Reads a CSV/doc/image/PDF upload into reviewable lead rows. */
export const parseLeadFile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ParseInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    const bytes = Uint8Array.from(atob(data.dataBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error("ফাইলটি অনেক বড় — ৮ মেগাবাইটের কম ফাইল দিন");
    }

    const mime = data.mimeType.toLowerCase();
    const lowerName = data.fileName.toLowerCase();
    const isImage = mime.startsWith("image/");
    const isPdf = mime === "application/pdf" || lowerName.endsWith(".pdf");
    const isOffice =
      lowerName.endsWith(".docx") ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".pptx") ||
      mime.includes("openxmlformats");

    const content: Array<Record<string, unknown>> = [{ type: "text", text: PROMPT }];

    if (isImage) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${data.dataBase64}` },
      });
    } else if (isPdf) {
      content.push({
        type: "file",
        file: {
          filename: data.fileName,
          file_data: `data:application/pdf;base64,${data.dataBase64}`,
        },
      });
    } else if (isOffice) {
      const { extractOfficeText } = await import("@/lib/office-text.server");
      const text = await extractOfficeText(bytes.buffer as ArrayBuffer);
      if (!text) {
        throw new Error(
          "এই ফাইলটি পড়া যায়নি — একটি CSV ফাইল, PDF বা তালিকার ছবি দিলে সহজে পড়া যাবে",
        );
      }
      content.push({ type: "text", text: `Document text:\n${text.slice(0, 60_000)}` });
    } else {
      // CSV, TSV, TXT, JSON and anything else that is really plain text.
      const text = new TextDecoder().decode(bytes).trim();
      if (!text) throw new Error("ফাইলটি খালি");
      content.push({ type: "text", text: `File content:\n${text.slice(0, 60_000)}` });
    }

    const response = await (await import("@/lib/metered-fetch.server")).meteredFetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{ role: "user", content }],
      }),
    }, { provider: "lovable-ai", operation: "lead_import_ai", category: "other" });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 429)
        throw new Error("এখন অনেক অনুরোধ চলছে — একটু পরে আবার চেষ্টা করুন");
      if (response.status === 402)
        throw new Error("AI ক্রেডিট শেষ — মালিককে ক্রেডিট যোগ করতে বলুন");
      if (response.status === 403) throw new Error("এই কাজের জন্য AI এখন বন্ধ আছে");
      throw new Error(`ফাইল পড়া যায়নি (${response.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = stripFence(payload.choices?.[0]?.message?.content ?? "");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("ফাইল থেকে তালিকা বোঝা যায়নি — নাম ও ফোন নম্বর স্পষ্ট আছে কি দেখুন");
    }

    const rows = z.array(ParsedLeadRow).max(1000).safeParse(parsed);
    if (!rows.success || rows.data.length === 0) {
      throw new Error("ফাইলে ব্যবহারযোগ্য কোনো লিড পাওয়া যায়নি");
    }

    const { normalizeLeadPhone } = await import("@/lib/lead-intake.server");
    const seen = new Set<string>();
    const clean = rows.data
      .map((row) => ({ ...row, phoneNumber: normalizeLeadPhone(row.phoneNumber) }))
      .filter((row) => /^8801[3-9]\d{8}$/.test(row.phoneNumber))
      .filter((row) => (seen.has(row.phoneNumber) ? false : seen.add(row.phoneNumber)));

    return { rows: clean, skipped: rows.data.length - clean.length };
  });

const ImportInput = z.object({
  adminToken: z.string().nullable().optional(),
  rows: z.array(ParsedLeadRow).min(1).max(1000),
  /** Fallback when a row has no reference; usually the agent's own name. */
  referenceBy: z.string().trim().max(120).nullable().optional(),
});

/** Saves reviewed rows into the signed-in agent's own lead list. */
export const importMyLeads = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none" || !caller.profile) {
      throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
    }

    const { intakeLead } = await import("@/lib/lead-intake.server");
    let added = 0;
    let duplicate = 0;
    const failed: string[] = [];

    for (const row of data.rows) {
      try {
        const result = await intakeLead({
          name: row.name,
          phoneNumber: row.phoneNumber,
          notes: row.notes ?? null,
          address: row.address ?? null,
          serialNo: row.serialNo ?? null,
          referenceBy: row.referenceBy ?? data.referenceBy ?? caller.profile.name,
          ownerId: caller.profile.id,
          ownerName: caller.profile.name,
        });
        if (result.duplicate) duplicate += 1;
        else added += 1;
      } catch (error) {
        failed.push(`${row.name}: ${(error as Error).message}`);
      }
    }

    return { added, duplicate, failed };
  });
