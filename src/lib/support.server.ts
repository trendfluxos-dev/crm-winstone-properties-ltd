import { randomBytes } from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  DEFAULT_SUPPORT_SETTINGS,
  type AuthorKind,
  type ConversationStatus,
  type Priority,
  type SupportMessage,
  type SupportSettings,
} from "@/lib/support-shared";

/**
 * Support data layer. Every caller-facing entry point lives in a
 * `*.functions.ts` module that authorizes first; this file only touches rows.
 */

export async function getSupportSettings(): Promise<SupportSettings> {
  const { data } = await supabaseAdmin
    .from("support_settings")
    .select("data")
    .eq("id", "support")
    .maybeSingle();
  const stored = (data?.data ?? {}) as Partial<SupportSettings>;
  return {
    ...DEFAULT_SUPPORT_SETTINGS,
    ...stored,
    business_hours: {
      ...DEFAULT_SUPPORT_SETTINGS.business_hours,
      ...(stored.business_hours ?? {}),
    },
  };
}

export async function saveSupportSettings(patch: Partial<SupportSettings>) {
  const current = await getSupportSettings();
  const next = { ...current, ...patch };
  const { error } = await supabaseAdmin
    .from("support_settings")
    .upsert({ id: "support", data: next, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return next;
}

export async function ensureCustomer(input: {
  email?: string | null;
  name?: string | null;
  phone?: string | null;
}) {
  const email = input.email?.trim().toLowerCase() || null;
  if (email) {
    const { data: existing } = await supabaseAdmin
      .from("support_customers")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("support_customers")
        .update({
          last_seen_at: new Date().toISOString(),
          name: existing.name ?? input.name?.trim() ?? null,
        })
        .eq("id", existing.id);
      return existing;
    }
  }
  const { data, error } = await supabaseAdmin
    .from("support_customers")
    .insert({
      email,
      name: input.name?.trim() || null,
      phone: input.phone?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createConversation(input: {
  customerId: string;
  subject?: string | null;
  channel?: "web" | "email" | "whatsapp" | "phone";
  slaFirstResponseMinutes: number;
}) {
  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabaseAdmin
    .from("support_conversations")
    .insert({
      customer_id: input.customerId,
      access_token: token,
      subject: input.subject?.slice(0, 160) || null,
      channel: input.channel ?? "web",
      sla_due_at: new Date(Date.now() + input.slaFirstResponseMinutes * 60000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function conversationByToken(token: string) {
  const { data } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  return data;
}

export async function appendMessage(input: {
  conversationId: string;
  authorKind: AuthorKind;
  body: string;
  authorProfileId?: string | null;
  authorLabel?: string | null;
  attachments?: { name: string; size: number; type: string }[];
  aiModel?: string | null;
  aiConfidence?: number | null;
  aiCitations?: { id: string; slug: string; title: string }[];
  aiNeedsHuman?: boolean | null;
}) {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("support_messages")
    .insert({
      conversation_id: input.conversationId,
      author_kind: input.authorKind,
      author_profile_id: input.authorProfileId ?? null,
      author_label: input.authorLabel ?? null,
      body: input.body,
      attachments: input.attachments ?? [],
      ai_model: input.aiModel ?? null,
      ai_confidence: input.aiConfidence ?? null,
      ai_citations: input.aiCitations ?? [],
      ai_needs_human: input.aiNeedsHuman ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: conversation } = await supabaseAdmin
    .from("support_conversations")
    .select("message_count, first_customer_message_at, first_human_response_at, status")
    .eq("id", input.conversationId)
    .maybeSingle();

  const patch: {
    last_message_at: string;
    updated_at: string;
    message_count: number;
    unread_for_agent?: boolean;
    unread_for_customer?: boolean;
    first_customer_message_at?: string;
    first_human_response_at?: string;
    status?: string;
  } = {
    last_message_at: now,
    updated_at: now,
    message_count: (conversation?.message_count ?? 0) + 1,
  };
  if (input.authorKind === "customer") {
    patch.unread_for_agent = true;
    patch.unread_for_customer = false;
    if (!conversation?.first_customer_message_at) patch.first_customer_message_at = now;
    if (conversation?.status === "resolved") patch.status = "open";
  }
  if (input.authorKind === "agent") {
    patch.unread_for_customer = true;
    patch.unread_for_agent = false;
    if (!conversation?.first_human_response_at) patch.first_human_response_at = now;
  }
  if (input.authorKind === "ai") patch.unread_for_customer = true;


  await supabaseAdmin.from("support_conversations").update(patch).eq("id", input.conversationId);
  return data;
}

export async function listMessages(conversationId: string): Promise<SupportMessage[]> {
  const { data } = await supabaseAdmin
    .from("support_messages")
    .select(
      "id, conversation_id, author_kind, author_label, body, ai_model, ai_confidence, ai_citations, ai_needs_human, created_at",
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    ...row,
    author_kind: row.author_kind as SupportMessage["author_kind"],
    ai_confidence: row.ai_confidence === null ? null : Number(row.ai_confidence),
    ai_citations: (Array.isArray(row.ai_citations)
      ? row.ai_citations
      : []) as SupportMessage["ai_citations"],
  }));
}

export async function ticketForConversation(conversationId: string) {
  const { data } = await supabaseAdmin
    .from("support_tickets")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .maybeSingle();
  return data;
}

export async function logTicketEvent(input: {
  ticketId: string;
  kind: string;
  detail?: string | null;
  actorKind?: "ai" | "agent" | "customer" | "system";
  actorProfileId?: string | null;
  actorLabel?: string | null;
}) {
  await supabaseAdmin.from("support_ticket_events").insert({
    ticket_id: input.ticketId,
    kind: input.kind,
    detail: input.detail ?? null,
    actor_kind: input.actorKind ?? "system",
    actor_profile_id: input.actorProfileId ?? null,
    actor_label: input.actorLabel ?? null,
  });
}

/**
 * Turns an AI conversation into a human-owned one and opens the ticket that
 * carries it. Idempotent: an already escalated conversation keeps its ticket.
 */
export async function escalateConversation(input: {
  conversationId: string;
  reason: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  priority?: Priority;
  createdByKind?: "ai" | "agent" | "customer";
  actorProfileId?: string | null;
  actorLabel?: string | null;
}) {
  const existing = await ticketForConversation(input.conversationId);
  const now = new Date().toISOString();

  const { data: conversation } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("id", input.conversationId)
    .maybeSingle();
  if (!conversation) throw new Error("Conversation not found");

  await supabaseAdmin
    .from("support_conversations")
    .update({
      ai_handled: false,
      escalated_at: conversation.escalated_at ?? now,
      escalation_reason: input.reason,
      status: conversation.status === "resolved" ? "open" : conversation.status,
      priority: input.priority ?? conversation.priority,
      unread_for_agent: true,
      updated_at: now,
    })
    .eq("id", input.conversationId);

  if (existing) return existing;

  const { data: ticket, error } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      title: (input.title || conversation.subject || "Support request").slice(0, 160),
      description: input.description ?? null,
      customer_id: conversation.customer_id,
      conversation_id: conversation.id,
      category: input.category ?? conversation.category ?? null,
      priority: input.priority ?? (conversation.priority as Priority),
      created_by_kind: input.createdByKind ?? "ai",
      created_by_profile_id: input.actorProfileId ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logTicketEvent({
    ticketId: ticket.id,
    kind: "created",
    detail: input.reason,
    actorKind: input.createdByKind ?? "ai",
    actorProfileId: input.actorProfileId ?? null,
    actorLabel: input.actorLabel ?? null,
  });
  await appendMessage({
    conversationId: conversation.id,
    authorKind: "system",
    body: `Handed over to the support team. Ticket ${ticket.ref} created.`,
  });
  return ticket;
}

/** Full-text search over published knowledge base articles. */
export async function searchArticles(query: string, limit = 5) {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const terms = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);

  if (terms.length) {
    const { data } = await supabaseAdmin
      .from("support_articles")
      .select("id, slug, title, summary, body_markdown, tags, updated_at")
      .eq("status", "published")
      .textSearch("search_tsv", terms.map((term) => `${term}:*`).join(" | "), {
        config: "simple",
      })
      .limit(limit);
    if (data?.length) return data;
  }

  const { data } = await supabaseAdmin
    .from("support_articles")
    .select("id, slug, title, summary, body_markdown, tags, updated_at")
    .eq("status", "published")
    .or(`title.ilike.%${trimmed}%,body_markdown.ilike.%${trimmed}%`)
    .limit(limit);
  return data ?? [];
}

export function conversationStatusPatch(status: ConversationStatus) {
  const now = new Date().toISOString();
  return {
    status,
    resolved_at: status === "resolved" ? now : null,
    updated_at: now,
  };
}
