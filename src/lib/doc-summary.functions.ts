import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MAX_BYTES = 8 * 1024 * 1024;

const DocSummaryInput = z.object({
  adminToken: z.string().nullable().optional(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(3).max(120),
  /** Raw file bytes, base64 (no data: prefix). */
  dataBase64: z.string().min(8),
});

const PROMPT = `You are an executive assistant reading a Bangladesh sales/operations document (memo, report, sheet, or handwritten list) uploaded to a CRM.
Return ONLY a JSON object, no prose, no markdown fence.

Schema:
{
  "title": "short title of the document in Bengali or English as appropriate",
  "overview": "2-3 sentence summary of what this document contains",
  "agents": [
    {
      "name": "agent or person name exactly as written",
      "highlights": ["bullet 1", "bullet 2"],
      "numbers": ["metric 1", "metric 2"],
      "risks": ["risk or concern 1"],
      "actions": ["recommended next step 1"]
    }
  ],
  "overallActions": ["top next steps for management"]
}

Rules:
- Group every fact under the agent/person name it belongs to.
- If a name cannot be matched, put it under "name": "অন্যান্য".
- Keep Bengali text in Bengali; do not translate.
- Never invent numbers, names, or actions that are not in the document.
- If the document has no agent names, return one agent entry named "নথি" with general highlights.`;

function stripFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim();
}

/** Loads the active agent roster so the AI can match names accurately. */
async function activeAgentNames() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("name, employee_id")
    .eq("approval_status", "approved")
    .eq("is_active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((p) => `${p.name}${p.employee_id ? ` (${p.employee_id})` : ""}`)
    .join("\n");
}

/** Reads a doc/xlsx/pdf/image/text upload and returns a decorated summary grouped by agent name. */
export const summarizeDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DocSummaryInput.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireDispatch(caller);

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
        throw new Error("এই ফাইলটি পড়া যায়নি — একটি CSV, PDF বা ছবি দিলে সহজে পড়া যাবে");
      }
      content.push({ type: "text", text: `Document text:\n${text.slice(0, 60_000)}` });
    } else {
      const text = new TextDecoder().decode(bytes).trim();
      if (!text) throw new Error("ফাইলটি খালি");
      content.push({ type: "text", text: `File content:\n${text.slice(0, 60_000)}` });
    }

    const roster = await activeAgentNames();
    content.push({ type: "text", text: `Active agent roster:\n${roster}` });

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env["LOVABLE_API_KEY"] ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      if (response.status === 429)
        throw new Error("এখন অনেক অনুরোধ চলছে — একটু পরে আবার চেষ্টা করুন");
      if (response.status === 402)
        throw new Error("AI ক্রেডিট শেষ — মালিককে ক্রেডিট যোগ করতে বলুন");
      if (response.status === 403) throw new Error("এই কাজের জন্য AI এখন বন্ধ আছে");
      throw new Error(`সারসংক্ষেপ তৈরি করা গেল না (${response.status}): ${detail.slice(0, 200)}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = stripFence(payload.choices?.[0]?.message?.content ?? "");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI সারসংক্ষেপ বোঝা যায়নি — আবার চেষ্টা করুন");
    }

    const summary = DocSummaryOutput.parse(parsed);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "document_summarized",
      entityType: "document",
      entityId: data.fileName,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "অজানা",
      metadata: { title: summary.title, agents: summary.agents.map((a) => a.name) },
    });

    return summary;
  });

const DocSummaryOutput = z.object({
  title: z.string().min(1),
  overview: z.string().min(1),
  agents: z.array(
    z.object({
      name: z.string().min(1),
      highlights: z.array(z.string()).default([]),
      numbers: z.array(z.string()).default([]),
      risks: z.array(z.string()).default([]),
      actions: z.array(z.string()).default([]),
    }),
  ),
  overallActions: z.array(z.string()).default([]),
});

export type DocSummary = z.infer<typeof DocSummaryOutput>;
