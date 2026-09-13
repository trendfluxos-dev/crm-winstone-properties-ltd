import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Documentation CMS backed by public.doc_pages. Published pages are readable by
 * everyone; drafts and editing require a supervisor (IT Console) session.
 */
const STATUS = ["draft", "in_review", "published", "archived"] as const;

const Token = z.string().nullable().optional();

async function requireEditor(adminToken: string | null, write = false) {
  const { resolveCaller, requireDispatch, requireWrite } = await import("@/lib/access.server");
  const caller = await resolveCaller(adminToken);
  requireDispatch(caller);
  if (write) requireWrite(caller);
  return caller;
}

/** Published navigation + search index — safe for anyone. */
export const listPublishedDocs = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("doc_pages")
    .select("id, slug, title, category, summary, sort_order, updated_at")
    .eq("status", "published")
    .order("category")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const readPublishedDoc = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ slug: z.string().min(1).max(160) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin
      .from("doc_pages")
      .select("slug, title, category, summary, body_markdown, updated_at, published_at, source")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return page;
  });

/** Every page, any status — IT Console only. */
export const listAllDocs = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: Token }).parse(input))
  .handler(async ({ data }) => {
    await requireEditor(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("doc_pages")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const readDocForEdit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: Token, slug: z.string().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data }) => {
    await requireEditor(data.adminToken ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: page, error } = await supabaseAdmin
      .from("doc_pages")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return page;
  });

const SaveInput = z.object({
  adminToken: Token,
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/, "slug: only lowercase letters, numbers and dashes"),
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  summary: z.string().trim().max(400).nullable().optional(),
  bodyMarkdown: z.string().max(200_000),
  status: z.enum(STATUS),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

/** Create or update one page; publishing stamps published_at. */
export const saveDoc = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SaveInput.parse(input))
  .handler(async ({ data }) => {
    const caller = await requireEditor(data.adminToken ?? null, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: saved, error } = await supabaseAdmin
      .from("doc_pages")
      .upsert(
        {
          slug: data.slug,
          title: data.title,
          category: data.category,
          summary: data.summary?.trim() || null,
          body_markdown: data.bodyMarkdown,
          status: data.status,
          sort_order: data.sortOrder,
          source: "cms",
          updated_by: caller.profile?.id ?? null,
          published_at: data.status === "published" ? new Date().toISOString() : null,
        },
        { onConflict: "slug" },
      )
      .select("slug, status")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });
