import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Smart summary from the agent's own report text — no transcript, no recording
 * needed. Reuses the project's existing Lovable AI gateway path (same model as
 * the copilot), and is only called from the report form behind a debounce, so it
 * costs one short request per pause, never one per keystroke.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash";

export const draftReportSummary = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string().nullable().optional(),
        text: z.string().trim().max(4000),
        category: z.string().max(40).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none") throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");

    // No text -> no summary. Never invent one.
    if (data.text.length < 25) return { summary: null as string | null };

    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { summary: null as string | null };

    const response = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 220,
        messages: [
          {
            role: "system",
            content:
              "You summarise a Bangladeshi tele-sales agent's own call notes. Reply in Bengali, 2-3 short bullet lines starting with '• ', covering what the customer said and the next step. Use ONLY facts present in the notes; never invent prices, names or promises. If the notes are too thin, reply exactly: NOT_ENOUGH",
          },
          {
            role: "user",
            content: `${data.category ? `ক্যাটাগরি: ${data.category}\n` : ""}নোট:\n${data.text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      if (response.status === 402) throw new Error("AI ক্রেডিট শেষ — সারাংশ নিজে লিখুন");
      throw new Error(`AI সারাংশ পাওয়া যায়নি (${response.status}) ${message.slice(0, 120)}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text || text.includes("NOT_ENOUGH")) return { summary: null as string | null };
    return { summary: text };
  });
