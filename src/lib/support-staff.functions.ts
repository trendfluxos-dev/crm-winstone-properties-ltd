import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  CONVERSATION_STATUSES,
  PRIORITIES,
  SUPPORT_CATEGORIES,
  TICKET_STATUSES,
} from "@/lib/support-shared";

/**
 * Staff support endpoints (inbox, tickets, customers, AI assist). Every handler
 * resolves the caller server-side first; an agent can only touch conversations
 * assigned to them or still unassigned.
 */

const staffInput = z.object({ adminToken: z.string().optional().nullable() });

async function caller(adminToken?: string | null) {
  const { resolveCaller } = await import("@/lib/access.server");
  const { requireSupportStaff } = await import("@/lib/support-access.server");
  return requireSupportStaff(await resolveCaller(adminToken ?? null));
}

async function writer(adminToken?: string | null) {
  const { resolveCaller } = await import("@/lib/access.server");
  const { requireSupportWrite } = await import("@/lib/support-access.server");
  return requireSupportWrite(await resolveCaller(adminToken ?? null));
}

/** Agents see their own + unassigned work; leads and admins see everything. */
function canTouch(
  scope: "authority" | "coordinator" | "agent" | "none",
  profileId: string | null,
  assignee: string | null,
) {
  if (scope === "authority" || scope === "coordinator") return true;
  return !assignee || assignee === profileId;
}

export const listSupportInbox = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        status: z.enum(["all", ...CONVERSATION_STATUSES]).default("open"),
        mine: z.boolean().default(false),
        search: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await caller(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("support_conversations")
      .select(
        "id, subject, status, priority, channel, category, sentiment, ai_handled, escalated_at, escalation_reason, assignee_profile_id, unread_for_agent, message_count, sla_due_at, first_human_response_at, last_message_at, created_at, customer_id",
      )
      .order("last_message_at", { ascending: false })
      .limit(200);

    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.mine && me.profile?.id) query = query.eq("assignee_profile_id", me.profile.id);
    if (data.search) query = query.ilike("subject", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const customerIds = [...new Set((rows ?? []).map((row) => row.customer_id))];
    const { data: customers } = customerIds.length
      ? await supabaseAdmin
          .from("support_customers")
          .select("id, name, email, company")
          .in("id", customerIds)
      : { data: [] };
    const customerById = new Map((customers ?? []).map((c) => [c.id, c]));

    const visible = (rows ?? []).filter((row) =>
      canTouch(me.scope, me.profile?.id ?? null, row.assignee_profile_id),
    );

    const { data: staff } = await supabaseAdmin
      .from("profiles")
      .select("id, name, role")
      .eq("approval_status", "approved")
      .eq("is_active", true)
      .order("name");

    return {
      conversations: visible.map((row) => ({
        ...row,
        customer: customerById.get(row.customer_id) ?? null,
      })),
      staff: staff ?? [],
      me: {
        scope: me.scope,
        profileId: me.profile?.id ?? null,
        name: me.profile?.name ?? null,
        readOnly: me.readOnly,
      },
    };
  });

export const getSupportConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput.extend({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await caller(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listMessages, ticketForConversation } = await import("@/lib/support.server");

    const { data: conversation } = await supabaseAdmin
      .from("support_conversations")
      .select("*")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found");
    if (!canTouch(me.scope, me.profile?.id ?? null, conversation.assignee_profile_id)) {
      throw new Error("This conversation belongs to another agent");
    }

    const [{ data: customer }, messages, ticket, { data: notes }, { data: canned }] =
      await Promise.all([
        supabaseAdmin
          .from("support_customers")
          .select("*")
          .eq("id", conversation.customer_id)
          .maybeSingle(),
        listMessages(data.conversationId),
        ticketForConversation(data.conversationId),
        supabaseAdmin
          .from("support_notes")
          .select("id, body, author_label, created_at")
          .eq("conversation_id", data.conversationId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("support_canned_replies")
          .select("id, shortcut, title, body")
          .order("shortcut"),
      ]);

    const { data: events } = ticket
      ? await supabaseAdmin
          .from("support_ticket_events")
          .select("id, kind, detail, actor_kind, actor_label, created_at")
          .eq("ticket_id", ticket.id)
          .order("created_at", { ascending: false })
      : { data: [] };

    const { data: history } = await supabaseAdmin
      .from("support_conversations")
      .select("id, subject, status, created_at")
      .eq("customer_id", conversation.customer_id)
      .neq("id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(8);

    await supabaseAdmin
      .from("support_conversations")
      .update({ unread_for_agent: false })
      .eq("id", data.conversationId);

    return {
      conversation,
      customer,
      messages,
      ticket,
      events: events ?? [],
      notes: notes ?? [],
      cannedReplies: canned ?? [],
      customerHistory: history ?? [],
      me: {
        scope: me.scope,
        profileId: me.profile?.id ?? null,
        name: me.profile?.name ?? null,
        readOnly: me.readOnly,
      },
    };
  });

export const sendSupportReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        conversationId: z.string().uuid(),
        body: z.string().trim().min(1).max(6000),
        resolve: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await writer(data.adminToken);
    const { appendMessage, conversationStatusPatch } = await import("@/lib/support.server");
    const { actorLabel } = await import("@/lib/support-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conversation } = await supabaseAdmin
      .from("support_conversations")
      .select("id, assignee_profile_id, ai_handled")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found");
    if (!canTouch(me.scope, me.profile?.id ?? null, conversation.assignee_profile_id)) {
      throw new Error("This conversation belongs to another agent");
    }

    await appendMessage({
      conversationId: data.conversationId,
      authorKind: "agent",
      authorProfileId: me.profile?.id ?? null,
      authorLabel: actorLabel(me),
      body: data.body,
    });

    // A human is now on the thread: the AI stops replying to it.
    await supabaseAdmin
      .from("support_conversations")
      .update({
        ai_handled: false,
        ...(conversation.assignee_profile_id || !me.profile?.id
          ? {}
          : { assignee_profile_id: me.profile.id }),
        ...(data.resolve ? conversationStatusPatch("resolved") : {}),
      })
      .eq("id", data.conversationId);

    return { ok: true };
  });

export const updateSupportConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        conversationId: z.string().uuid(),
        status: z.enum(CONVERSATION_STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        category: z.enum(SUPPORT_CATEGORIES).optional(),
        assigneeProfileId: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await writer(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { conversationStatusPatch, ticketForConversation, logTicketEvent } = await import(
      "@/lib/support.server"
    );
    const { actorLabel } = await import("@/lib/support-access.server");

    const { data: conversation } = await supabaseAdmin
      .from("support_conversations")
      .select("id, assignee_profile_id, status")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found");
    if (!canTouch(me.scope, me.profile?.id ?? null, conversation.assignee_profile_id)) {
      throw new Error("This conversation belongs to another agent");
    }
    if (data.assigneeProfileId !== undefined && me.scope === "agent") {
      throw new Error("Only a support lead can reassign conversations");
    }

    const patch: {
      updated_at: string;
      status?: string;
      resolved_at?: string | null;
      priority?: string;
      category?: string;
      assignee_profile_id?: string | null;
    } = { updated_at: new Date().toISOString() };
    if (data.status) Object.assign(patch, conversationStatusPatch(data.status));
    if (data.priority) patch.priority = data.priority;
    if (data.category) patch.category = data.category;
    if (data.assigneeProfileId !== undefined) patch.assignee_profile_id = data.assigneeProfileId;

    const { error } = await supabaseAdmin
      .from("support_conversations")
      .update(patch)
      .eq("id", data.conversationId);
    if (error) throw new Error(error.message);

    const ticket = await ticketForConversation(data.conversationId);
    if (ticket) {
      const ticketPatch: Record<string, string | null> = {};
      if (data.status) ticketPatch["status"] = data.status;
      if (data.priority) ticketPatch["priority"] = data.priority;
      if (data.assigneeProfileId !== undefined)
        ticketPatch["assignee_profile_id"] = data.assigneeProfileId;
      if (Object.keys(ticketPatch).length) {
        await supabaseAdmin
          .from("support_tickets")
          .update({
            ...ticketPatch,
            resolved_at: data.status === "resolved" ? new Date().toISOString() : null,
          })
          .eq("id", ticket.id);
      }
      await logTicketEvent({
        ticketId: ticket.id,
        kind: data.status ? `status_${data.status}` : "updated",
        detail: [
          data.priority ? `priority ${data.priority}` : null,
          data.assigneeProfileId !== undefined ? "assignee changed" : null,
          data.category ? `category ${data.category}` : null,
        ]
          .filter(Boolean)
          .join(", "),
        actorKind: "agent",
        actorProfileId: me.profile?.id ?? null,
        actorLabel: actorLabel(me),
      });
    }
    return { ok: true };
  });

export const escalateSupportConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        conversationId: z.string().uuid(),
        reason: z.string().trim().min(3).max(400),
        priority: z.enum(PRIORITIES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await writer(data.adminToken);
    const { escalateConversation } = await import("@/lib/support.server");
    const { actorLabel } = await import("@/lib/support-access.server");
    const ticket = await escalateConversation({
      conversationId: data.conversationId,
      reason: data.reason,
      priority: data.priority,
      createdByKind: "agent",
      actorProfileId: me.profile?.id ?? null,
      actorLabel: actorLabel(me),
    });
    return { ref: ticket.ref };
  });

export const addSupportNote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        conversationId: z.string().uuid().optional(),
        ticketId: z.string().uuid().optional(),
        customerId: z.string().uuid().optional(),
        body: z.string().trim().min(1).max(3000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await writer(data.adminToken);
    const { actorLabel } = await import("@/lib/support-access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_notes").insert({
      conversation_id: data.conversationId ?? null,
      ticket_id: data.ticketId ?? null,
      customer_id: data.customerId ?? null,
      author_profile_id: me.profile?.id ?? null,
      author_label: actorLabel(me),
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** AI summary + draft reply for the agent. Nothing is sent to the customer. */
export const assistSupportConversation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput.extend({ conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const me = await caller(data.adminToken);
    const { listMessages } = await import("@/lib/support.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: conversation } = await supabaseAdmin
      .from("support_conversations")
      .select("id, customer_id, assignee_profile_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (!conversation) throw new Error("Conversation not found");
    if (!canTouch(me.scope, me.profile?.id ?? null, conversation.assignee_profile_id)) {
      throw new Error("This conversation belongs to another agent");
    }

    const { data: customer } = await supabaseAdmin
      .from("support_customers")
      .select("name")
      .eq("id", conversation.customer_id)
      .maybeSingle();

    const { assistAgent } = await import("@/lib/support-ai.server");
    const result = await assistAgent({
      history: await listMessages(data.conversationId),
      customerName: customer?.name ?? null,
    });

    await supabaseAdmin
      .from("support_conversations")
      .update({ ai_summary: result.summary })
      .eq("id", data.conversationId);
    return result;
  });

export const listSupportTickets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        status: z.enum(["all", ...TICKET_STATUSES]).default("open"),
        priority: z.enum(["all", ...PRIORITIES]).default("all"),
        search: z.string().trim().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await caller(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("support_tickets")
      .select(
        "id, ref, title, status, priority, category, customer_id, conversation_id, assignee_profile_id, created_by_kind, created_at, resolved_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.priority !== "all") query = query.eq("priority", data.priority);
    if (data.search) query = query.or(`ref.ilike.%${data.search}%,title.ilike.%${data.search}%`);

    const { data: tickets, error } = await query;
    if (error) throw new Error(error.message);

    const visible = (tickets ?? []).filter((ticket) =>
      canTouch(me.scope, me.profile?.id ?? null, ticket.assignee_profile_id),
    );
    const customerIds = [...new Set(visible.map((t) => t.customer_id).filter(Boolean))] as string[];
    const { data: customers } = customerIds.length
      ? await supabaseAdmin.from("support_customers").select("id, name, email").in("id", customerIds)
      : { data: [] };
    const byId = new Map((customers ?? []).map((c) => [c.id, c]));

    return {
      tickets: visible.map((ticket) => ({
        ...ticket,
        customer: ticket.customer_id ? byId.get(ticket.customer_id) ?? null : null,
      })),
      me: { scope: me.scope, readOnly: me.readOnly },
    };
  });

export const listSupportCustomers = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput.extend({ search: z.string().trim().max(120).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    await caller(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("support_customers")
      .select("id, name, email, phone, company, plan, tags, created_at, last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (data.search) {
      query = query.or(
        `name.ilike.%${data.search}%,email.ilike.%${data.search}%,company.ilike.%${data.search}%`,
      );
    }
    const { data: customers, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (customers ?? []).map((c) => c.id);
    const { data: conversations } = ids.length
      ? await supabaseAdmin
          .from("support_conversations")
          .select("id, customer_id, status, subject, last_message_at")
          .in("customer_id", ids)
          .order("last_message_at", { ascending: false })
      : { data: [] };

    const grouped = new Map<string, { open: number; total: number; lastSubject: string | null }>();
    for (const row of conversations ?? []) {
      const entry = grouped.get(row.customer_id) ?? { open: 0, total: 0, lastSubject: null };
      entry.total += 1;
      if (row.status !== "resolved") entry.open += 1;
      entry.lastSubject = entry.lastSubject ?? row.subject;
      grouped.set(row.customer_id, entry);
    }

    return {
      customers: (customers ?? []).map((customer) => ({
        ...customer,
        stats: grouped.get(customer.id) ?? { open: 0, total: 0, lastSubject: null },
      })),
    };
  });

export const updateSupportCustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    staffInput
      .extend({
        customerId: z.string().uuid(),
        name: z.string().trim().max(120).nullable().optional(),
        company: z.string().trim().max(160).nullable().optional(),
        phone: z.string().trim().max(40).nullable().optional(),
        plan: z.string().trim().max(60).nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(12).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await writer(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = {};
    for (const key of ["name", "company", "phone", "plan", "tags"] as const) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    const { error } = await supabaseAdmin
      .from("support_customers")
      .update(patch as never)
      .eq("id", data.customerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
