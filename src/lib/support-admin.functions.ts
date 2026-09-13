import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { ARTICLE_STATUSES, PRIORITIES } from "@/lib/support-shared";

/**
 * Knowledge base authoring, canned replies, support settings and analytics.
 * Authoring needs support-lead scope; settings need admin scope.
 */

const adminInput = z.object({ adminToken: z.string().optional().nullable() });

async function lead(adminToken?: string | null) {
  const { resolveCaller, requireWrite } = await import("@/lib/access.server");
  const { requireSupportLead } = await import("@/lib/support-access.server");
  const caller = requireSupportLead(await resolveCaller(adminToken ?? null));
  requireWrite(caller);
  return caller;
}

async function reader(adminToken?: string | null) {
  const { resolveCaller } = await import("@/lib/access.server");
  const { requireSupportStaff } = await import("@/lib/support-access.server");
  return requireSupportStaff(await resolveCaller(adminToken ?? null));
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || `article-${Date.now()}`
  );
}

export const listKbArticles = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adminInput.parse(input))
  .handler(async ({ data }) => {
    const me = await reader(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: articles }, { data: categories }] = await Promise.all([
      supabaseAdmin
        .from("support_articles")
        .select(
          "id, slug, title, summary, body_markdown, status, tags, category_id, view_count, updated_at, published_at",
        )
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("support_article_categories")
        .select("id, slug, name, description, sort_order")
        .order("sort_order"),
    ]);
    return {
      articles: articles ?? [],
      categories: categories ?? [],
      canEdit: (me.scope === "authority" || me.scope === "coordinator") && !me.readOnly,
    };
  });

export const saveKbArticle = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    adminInput
      .extend({
        id: z.string().uuid().optional(),
        title: z.string().trim().min(3).max(160),
        summary: z.string().trim().max(400).optional(),
        bodyMarkdown: z.string().trim().min(10).max(60000),
        status: z.enum(ARTICLE_STATUSES).default("draft"),
        categoryId: z.string().uuid().nullable().optional(),
        tags: z.array(z.string().trim().max(40)).max(12).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const me = await lead(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const payload = {
      title: data.title,
      summary: data.summary || null,
      body_markdown: data.bodyMarkdown,
      status: data.status,
      category_id: data.categoryId ?? null,
      tags: data.tags,
      author_profile_id: me.profile?.id ?? null,
      published_at: data.status === "published" ? now : null,
      updated_at: now,
    };

    if (data.id) {
      const { error } = await supabaseAdmin
        .from("support_articles")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("support_articles")
      .insert({ ...payload, slug: slugify(data.title) })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteKbArticle = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adminInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await lead(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("support_articles")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveKbCategory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    adminInput
      .extend({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(240).optional(),
        sortOrder: z.number().int().min(0).max(99).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await lead(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_article_categories").insert({
      slug: slugify(data.name),
      name: data.name,
      description: data.description || null,
      sort_order: data.sortOrder,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveCannedReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    adminInput
      .extend({
        id: z.string().uuid().optional(),
        shortcut: z
          .string()
          .trim()
          .regex(/^\/[a-z0-9-]{2,24}$/, "Use a shortcut like /refund"),
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().min(2).max(4000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await lead(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload = {
      shortcut: data.shortcut,
      title: data.title,
      body: data.body,
      updated_at: new Date().toISOString(),
    };
    const { error } = data.id
      ? await supabaseAdmin.from("support_canned_replies").update(payload).eq("id", data.id)
      : await supabaseAdmin.from("support_canned_replies").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCannedReply = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adminInput.extend({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await lead(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("support_canned_replies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCannedReplies = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adminInput.parse(input))
  .handler(async ({ data }) => {
    await reader(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: replies } = await supabaseAdmin
      .from("support_canned_replies")
      .select("id, shortcut, title, body, updated_at")
      .order("shortcut");
    return replies ?? [];
  });

export const loadSupportSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => adminInput.parse(input))
  .handler(async ({ data }) => {
    const me = await reader(data.adminToken);
    const { getSupportSettings } = await import("@/lib/support.server");
    return {
      settings: await getSupportSettings(),
      canEdit: me.scope === "authority" && !me.readOnly,
    };
  });

export const updateSupportSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    adminInput
      .extend({
        ai_enabled: z.boolean().optional(),
        ai_confidence_threshold: z.number().min(0).max(1).optional(),
        ai_persona: z.string().trim().min(2).max(60).optional(),
        auto_escalate_on_low_confidence: z.boolean().optional(),
        sla_first_response_minutes: z.number().int().min(5).max(10080).optional(),
        sla_resolution_minutes: z.number().int().min(30).max(40320).optional(),
        notify_on_escalation: z.boolean().optional(),
        default_priority: z.enum(PRIORITIES).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireWrite } = await import("@/lib/access.server");
    const { requireSupportAdmin } = await import("@/lib/support-access.server");
    const caller = requireSupportAdmin(await resolveCaller(data.adminToken ?? null));
    requireWrite(caller);

    const { saveSupportSettings } = await import("@/lib/support.server");
    const { adminToken: _ignored, ...patch } = data;
    const saved = await saveSupportSettings(patch);

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "settings_updated",
      entityType: "support_settings",
      entityId: "support",
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Support admin",
      metadata: patch,
    });
    return saved;
  });

/** Volume, AI deflection, SLA and CSAT for the last N days. */
export const supportAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    adminInput.extend({ days: z.number().int().min(7).max(90).default(30) }).parse(input),
  )
  .handler(async ({ data }) => {
    await reader(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const [{ data: conversations }, { data: tickets }, { data: csat }, { data: staff }] =
      await Promise.all([
        supabaseAdmin
          .from("support_conversations")
          .select(
            "id, status, priority, category, channel, ai_handled, escalated_at, assignee_profile_id, first_customer_message_at, first_human_response_at, resolved_at, sla_due_at, created_at",
          )
          .gte("created_at", since),
        supabaseAdmin
          .from("support_tickets")
          .select("id, status, priority, created_by_kind, created_at, resolved_at")
          .gte("created_at", since),
        supabaseAdmin.from("support_csat").select("rating, created_at").gte("created_at", since),
        supabaseAdmin
          .from("profiles")
          .select("id, name")
          .eq("approval_status", "approved")
          .eq("is_active", true),
      ]);

    const rows = conversations ?? [];
    const escalated = rows.filter((row) => row.escalated_at).length;
    const resolved = rows.filter((row) => row.status === "resolved");

    const responseMinutes = rows
      .filter((row) => row.first_human_response_at && row.first_customer_message_at)
      .map(
        (row) =>
          (new Date(row.first_human_response_at!).getTime() -
            new Date(row.first_customer_message_at!).getTime()) /
          60000,
      );
    const resolutionMinutes = resolved
      .filter((row) => row.resolved_at)
      .map((row) => (new Date(row.resolved_at!).getTime() - new Date(row.created_at).getTime()) / 60000);
    const slaBreaches = rows.filter(
      (row) =>
        row.sla_due_at &&
        !row.first_human_response_at &&
        new Date(row.sla_due_at).getTime() < Date.now(),
    ).length;

    const average = (values: number[]) =>
      values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

    const byDay = new Map<string, { conversations: number; escalations: number }>();
    for (const row of rows) {
      const day = row.created_at.slice(0, 10);
      const entry = byDay.get(day) ?? { conversations: 0, escalations: 0 };
      entry.conversations += 1;
      if (row.escalated_at) entry.escalations += 1;
      byDay.set(day, entry);
    }

    const byCategory = new Map<string, number>();
    for (const row of rows) {
      const key = row.category ?? "other";
      byCategory.set(key, (byCategory.get(key) ?? 0) + 1);
    }

    const nameById = new Map((staff ?? []).map((person) => [person.id, person.name]));
    const byAgent = new Map<string, { name: string; assigned: number; resolved: number }>();
    for (const row of rows) {
      if (!row.assignee_profile_id) continue;
      const entry = byAgent.get(row.assignee_profile_id) ?? {
        name: nameById.get(row.assignee_profile_id) ?? "Unknown",
        assigned: 0,
        resolved: 0,
      };
      entry.assigned += 1;
      if (row.status === "resolved") entry.resolved += 1;
      byAgent.set(row.assignee_profile_id, entry);
    }

    const ratings = (csat ?? []).map((row) => row.rating);

    return {
      days: data.days,
      totals: {
        conversations: rows.length,
        open: rows.filter((row) => row.status === "open").length,
        pending: rows.filter((row) => row.status === "pending").length,
        resolved: resolved.length,
        escalated,
        aiResolved: rows.filter((row) => row.ai_handled && row.status === "resolved").length,
        deflectionRate: rows.length ? (rows.length - escalated) / rows.length : null,
        tickets: (tickets ?? []).length,
        aiCreatedTickets: (tickets ?? []).filter((row) => row.created_by_kind === "ai").length,
        slaBreaches,
        avgFirstResponseMinutes: average(responseMinutes),
        avgResolutionMinutes: average(resolutionMinutes),
        csatAverage: average(ratings),
        csatResponses: ratings.length,
      },
      byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, value]) => ({ day, ...value })),
      byCategory: [...byCategory.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([category, count]) => ({ category, count })),
      byAgent: [...byAgent.values()].sort((a, b) => b.assigned - a.assigned),
    };
  });
