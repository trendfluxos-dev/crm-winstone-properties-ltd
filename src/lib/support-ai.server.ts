import { logAiUsage } from "@/lib/ai-usage.server";
import { getSupportSettings, searchArticles } from "@/lib/support.server";
import type { Priority, SupportMessage } from "@/lib/support-shared";

/**
 * Grounded support AI. Answers come only from published knowledge base
 * articles; when the retrieved passages do not cover the question the model
 * must say so and hand over to a human. Model choice, prompts and the API key
 * never leave the server.
 */

const MODEL = "openai/gpt-6-astra";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/responses";

export type AiSupportAnswer = {
  answer: string;
  cited_article_ids: string[];
  confidence: number;
  intent: string;
  category: string;
  priority: Priority;
  sentiment: "positive" | "neutral" | "negative" | "angry";
  needs_human: boolean;
};

export type AiAnswerResult = AiSupportAnswer & {
  model: string;
  citations: { id: string; slug: string; title: string }[];
};

function apiKey() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace");
  return key;
}

function gatewayError(status: number): Error {
  if (status === 429) return new Error("The AI assistant is busy — please try again in a moment.");
  if (status === 402) return new Error("AI credits are exhausted for this workspace.");
  if (status === 403) return new Error("AI access is blocked for this workspace.");
  return new Error(`AI request failed (${status})`);
}

/**
 * One streamed Responses API call that returns strict JSON. Streaming is
 * required: reasoning runs routinely outlive a buffered request.
 */
async function askJson<T>(input: {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey(),
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: input.system }] },
        { role: "user", content: [{ type: "input_text", text: input.user }] },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
  });

  if (!response.ok || !response.body) throw gatewayError(response.status);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          text += event.delta;
        }
        if (event.type === "response.completed" && event.response?.output_text) {
          text = event.response.output_text;
        }
      } catch {
        // Ignore non-JSON keep-alive frames.
      }
    }
  }

  if (!text.trim()) throw new Error("The AI assistant returned an empty response.");
  return JSON.parse(text) as T;
}

const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "answer",
    "cited_article_ids",
    "confidence",
    "intent",
    "category",
    "priority",
    "sentiment",
    "needs_human",
  ],
  properties: {
    answer: { type: "string" },
    cited_article_ids: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
    intent: { type: "string" },
    category: {
      type: "string",
      enum: ["getting-started", "billing", "technical", "account", "policies", "other"],
    },
    priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "angry"] },
    needs_human: { type: "boolean" },
  },
} as const;

function answerSystemPrompt(persona: string) {
  return `You are ${persona}, an AI customer-support assistant.

Hard rules:
- Answer ONLY from the knowledge base passages given in the request.
- NEVER invent company policies, product facts, prices, refund rules, delivery
  times, account details, or anything about this specific customer's account.
- If the passages do not clearly answer the question, set needs_human to true,
  set confidence below 0.4, and reply that you cannot verify the answer and are
  handing the conversation to a human colleague. Do not guess.
- If the customer asks for a human, complains, or is angry, set needs_human true.
- Cite the ids of the passages you used in cited_article_ids. If you used none,
  return an empty list and needs_human true.
- Be concise (max 6 short sentences), warm, professional, plain text, no markdown headings.
- confidence is your own 0-1 estimate that the answer is fully supported by the passages.
- category/priority/sentiment/intent describe the customer's issue for routing.`;
}

export async function answerCustomerMessage(input: {
  question: string;
  history: SupportMessage[];
  customerName?: string | null;
}): Promise<AiAnswerResult> {
  const settings = await getSupportSettings();
  const articles = await searchArticles(input.question, 5);

  const passages = articles
    .map(
      (article) =>
        `[id: ${article.id}] ${article.title}\n${(article.summary ?? "").trim()}\n${article.body_markdown.slice(0, 2500)}`,
    )
    .join("\n\n---\n\n");

  const transcript = input.history
    .slice(-10)
    .map((message) => `${message.author_kind.toUpperCase()}: ${message.body}`)
    .join("\n");

  const result = await askJson<AiSupportAnswer>({
    system: answerSystemPrompt(settings.ai_persona),
    schemaName: "support_answer",
    schema: ANSWER_SCHEMA,
    user: `Knowledge base passages:\n${passages || "(no matching articles found)"}\n\nConversation so far:\n${transcript || "(new conversation)"}\n\nCustomer name: ${input.customerName ?? "unknown"}\nNew customer message: ${input.question}`,
  });

  await logAiUsage({
    category: "other",
    model: MODEL,
    detail: "support_ai_answer",
  });

  const byId = new Map(articles.map((article) => [article.id, article]));
  const citations = (result.cited_article_ids ?? [])
    .map((id) => byId.get(id))
    .filter((article): article is (typeof articles)[number] => Boolean(article))
    .map((article) => ({ id: article.id, slug: article.slug, title: article.title }));

  const confidence = Math.max(0, Math.min(1, Number(result.confidence) || 0));
  const needsHuman =
    Boolean(result.needs_human) ||
    citations.length === 0 ||
    (settings.auto_escalate_on_low_confidence && confidence < settings.ai_confidence_threshold);

  return { ...result, confidence, needs_human: needsHuman, citations, model: MODEL };
}

const AGENT_ASSIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggested_reply", "sentiment", "suggested_priority", "next_steps"],
  properties: {
    summary: { type: "string" },
    suggested_reply: { type: "string" },
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "angry"] },
    suggested_priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
    next_steps: { type: "array", items: { type: "string" } },
  },
} as const;

export type AgentAssist = {
  summary: string;
  suggested_reply: string;
  sentiment: string;
  suggested_priority: Priority;
  next_steps: string[];
};

/** Summary + draft reply for an agent. Nothing is sent automatically. */
export async function assistAgent(input: {
  history: SupportMessage[];
  customerName?: string | null;
  question?: string | null;
}): Promise<AgentAssist & { model: string }> {
  const settings = await getSupportSettings();
  const lastCustomer = [...input.history].reverse().find((m) => m.author_kind === "customer");
  const articles = await searchArticles(input.question || lastCustomer?.body || "", 4);

  const result = await askJson<AgentAssist>({
    system: `You assist a human support agent. Summarize the conversation factually and draft a
reply the agent can edit before sending. Use ONLY the knowledge base passages for
factual claims; if a fact is not covered, write a placeholder like
"[needs verification]" instead of inventing it. Keep the draft under 120 words.`,
    schemaName: "agent_assist",
    schema: AGENT_ASSIST_SCHEMA,
    user: `Knowledge base passages:\n${
      articles
        .map((a) => `[${a.title}] ${a.body_markdown.slice(0, 1500)}`)
        .join("\n\n") || "(none)"
    }\n\nCustomer: ${input.customerName ?? "unknown"}\nPersona: ${settings.ai_persona}\n\nConversation:\n${input.history
      .slice(-16)
      .map((m) => `${m.author_kind.toUpperCase()}: ${m.body}`)
      .join("\n")}`,
  });

  await logAiUsage({ category: "other", model: MODEL, detail: "support_agent_assist" });
  return { ...result, model: MODEL };
}
