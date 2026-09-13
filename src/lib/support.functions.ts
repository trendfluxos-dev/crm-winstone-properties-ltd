import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { CustomerThread } from "@/lib/support-shared";

/**
 * Customer-facing support endpoints. No account is required: a conversation is
 * addressed by an unguessable token that the browser keeps. Every handler
 * resolves the conversation from that token, so one customer can never read
 * another customer's thread.
 */

const tokenInput = z.object({ token: z.string().min(10) });

async function buildThread(conversationId: string): Promise<CustomerThread> {
  const { listMessages, ticketForConversation } = await import("@/lib/support.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: conversation }, messages, ticket, { data: csat }] = await Promise.all([
    supabaseAdmin
      .from("support_conversations")
      .select("id, subject, status, escalated_at, ai_handled, created_at")
      .eq("id", conversationId)
      .single(),
    listMessages(conversationId),
    ticketForConversation(conversationId),
    supabaseAdmin
      .from("support_csat")
      .select("rating")
      .eq("conversation_id", conversationId)
      .maybeSingle(),
  ]);

  return {
    conversation: conversation as CustomerThread["conversation"],
    messages,
    ticket: ticket
      ? {
          ref: ticket.ref,
          status: ticket.status as CustomerThread["ticket"] extends null
            ? never
            : "open" | "pending" | "resolved" | "closed",
          priority: ticket.priority as "low" | "normal" | "high" | "urgent",
        }
      : null,
    csat: csat ? { rating: csat.rating } : null,
  };
}

/** Runs the grounded AI reply for the newest customer message. */
async function runAiTurn(conversationId: string, customerName: string | null) {
  const { getSupportSettings, listMessages, appendMessage, escalateConversation } = await import(
    "@/lib/support.server"
  );
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const settings = await getSupportSettings();
  const { data: conversation } = await supabaseAdmin
    .from("support_conversations")
    .select("id, ai_handled")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.ai_handled) return;

  const history = await listMessages(conversationId);
  const last = [...history].reverse().find((message) => message.author_kind === "customer");
  if (!last) return;

  if (!settings.ai_enabled) {
    await escalateConversation({
      conversationId,
      reason: "AI assistant is switched off — routed to the support team",
    });
    return;
  }

  try {
    const { answerCustomerMessage } = await import("@/lib/support-ai.server");
    const result = await answerCustomerMessage({
      question: last.body,
      history,
      customerName,
    });

    await appendMessage({
      conversationId,
      authorKind: "ai",
      authorLabel: settings.ai_persona,
      body: result.answer,
      aiModel: result.model,
      aiConfidence: result.confidence,
      aiCitations: result.citations,
      aiNeedsHuman: result.needs_human,
    });

    await supabaseAdmin
      .from("support_conversations")
      .update({
        category: result.category,
        intent: result.intent,
        sentiment: result.sentiment,
        priority: result.priority,
      })
      .eq("id", conversationId);

    if (result.needs_human) {
      await escalateConversation({
        conversationId,
        reason:
          result.citations.length === 0
            ? "AI could not verify an answer from the knowledge base"
            : `AI confidence ${(result.confidence * 100).toFixed(0)}% below threshold`,
        title: last.body.slice(0, 120),
        description: last.body,
        category: result.category,
        priority: result.priority,
      });
    }
  } catch (error) {
    console.error("[support-ai] answer failed", error);
    await appendMessage({
      conversationId,
      authorKind: "system",
      body: "The AI assistant is unavailable right now, so a member of the support team will take over this conversation.",
    });
    await escalateConversation({
      conversationId,
      reason: `AI unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
    });
  }
}

export const startSupportConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().max(120).optional(),
        email: z.string().trim().email().max(180).optional().or(z.literal("")),
        message: z.string().trim().min(2).max(4000),
        attachments: z
          .array(z.object({ name: z.string(), size: z.number(), type: z.string(), path: z.string() }))
          .max(5)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { ensureCustomer, createConversation, appendMessage, getSupportSettings } = await import(
      "@/lib/support.server"
    );
    const settings = await getSupportSettings();
    const customer = await ensureCustomer({ email: data.email || null, name: data.name || null });
    const conversation = await createConversation({
      customerId: customer.id,
      subject: data.message.slice(0, 120),
      slaFirstResponseMinutes: settings.sla_first_response_minutes,
    });

    await appendMessage({
      conversationId: conversation.id,
      authorKind: "customer",
      authorLabel: customer.name ?? "Customer",
      body: data.message,
      attachments: data.attachments ?? [],
    });

    await runAiTurn(conversation.id, customer.name);
    return { token: conversation.access_token, thread: await buildThread(conversation.id) };
  });

export const getSupportThread = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenInput.parse(input))
  .handler(async ({ data }) => {
    const { conversationByToken } = await import("@/lib/support.server");
    const conversation = await conversationByToken(data.token);
    if (!conversation) throw new Error("This conversation link is no longer valid");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("support_conversations")
      .update({ unread_for_customer: false })
      .eq("id", conversation.id);
    return buildThread(conversation.id);
  });

export const sendSupportMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    tokenInput
      .extend({
        body: z.string().trim().min(1).max(4000),
        attachments: z
          .array(z.object({ name: z.string(), size: z.number(), type: z.string(), path: z.string() }))
          .max(5)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { conversationByToken, appendMessage } = await import("@/lib/support.server");
    const conversation = await conversationByToken(data.token);
    if (!conversation) throw new Error("This conversation link is no longer valid");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customer } = await supabaseAdmin
      .from("support_customers")
      .select("name")
      .eq("id", conversation.customer_id)
      .maybeSingle();

    await appendMessage({
      conversationId: conversation.id,
      authorKind: "customer",
      authorLabel: customer?.name ?? "Customer",
      body: data.body,
      attachments: data.attachments ?? [],
    });

    await runAiTurn(conversation.id, customer?.name ?? null);
    return buildThread(conversation.id);
  });

export const requestHumanSupport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => tokenInput.parse(input))
  .handler(async ({ data }) => {
    const { conversationByToken, escalateConversation, listMessages } = await import(
      "@/lib/support.server"
    );
    const conversation = await conversationByToken(data.token);
    if (!conversation) throw new Error("This conversation link is no longer valid");
    const history = await listMessages(conversation.id);
    const first = history.find((message) => message.author_kind === "customer");
    await escalateConversation({
      conversationId: conversation.id,
      reason: "Customer asked to speak with a person",
      title: (conversation.subject ?? first?.body ?? "Support request").slice(0, 120),
      description: first?.body ?? null,
      createdByKind: "customer",
    });
    return buildThread(conversation.id);
  });

export const submitSupportCsat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    tokenInput
      .extend({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(600).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { conversationByToken } = await import("@/lib/support.server");
    const conversation = await conversationByToken(data.token);
    if (!conversation) throw new Error("This conversation link is no longer valid");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_csat").upsert(
      {
        conversation_id: conversation.id,
        rating: data.rating,
        comment: data.comment ?? null,
      },
      { onConflict: "conversation_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Signed download links for attachments on a thread the token owns. */
export const getSupportAttachmentUrl = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ path: z.string().min(3) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("support-attachments")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

/** Uploads one attachment (base64) into the private support bucket. */
export const uploadSupportAttachment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(180),
        type: z.string().trim().max(120),
        base64: z.string().min(4).max(9_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Files must be 5 MB or smaller");
    const safe = data.name.replace(/[^\w.\-]+/g, "_").slice(-120);
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safe}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage
      .from("support-attachments")
      .upload(path, bytes, { contentType: data.type || "application/octet-stream", upsert: false });
    if (error) throw new Error(error.message);
    return { path, name: data.name, size: bytes.byteLength, type: data.type };
  });

/** Public knowledge base reads for the customer-facing help centre. */
export const listPublishedArticles = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: articles }, { data: categories }] = await Promise.all([
    supabaseAdmin
      .from("support_articles")
      .select("id, slug, title, summary, tags, category_id, updated_at")
      .eq("status", "published")
      .order("updated_at", { ascending: false }),
    supabaseAdmin
      .from("support_article_categories")
      .select("id, slug, name, description, sort_order")
      .order("sort_order"),
  ]);
  return { articles: articles ?? [], categories: categories ?? [] };
});

export const getPublishedArticle = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: article } = await supabaseAdmin
      .from("support_articles")
      .select("id, slug, title, summary, body_markdown, tags, updated_at, category_id, view_count")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (!article) return null;
    await supabaseAdmin
      .from("support_articles")
      .update({ view_count: article.view_count + 1 })
      .eq("id", article.id);
    return article;
  });
