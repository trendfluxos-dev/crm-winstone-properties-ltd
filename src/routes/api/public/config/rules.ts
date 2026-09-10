import { createFileRoute } from "@tanstack/react-router";

import { parseConfig } from "@/lib/crm-config";

function authorized(request: Request): boolean {
  const secret = process.env["INGEST_SECRET"];
  const provided = request.headers.get("x-ingest-secret") ?? "";
  if (!secret || provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Live rules + permissions + custom fields for the Android client. */
export const Route = createFileRoute("/api/public/config/rules")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin
          .from("app_config")
          .select("data, updated_at")
          .eq("id", "default")
          .maybeSingle();
        if (error) return json({ error: error.message }, 500);
        const config = parseConfig(data?.data ?? {});
        return json({
          ok: true,
          updated_at: data?.updated_at ?? null,
          rules: config.rules,
          permissions: config.permissions,
          fields: config.fields,
        });
      },
    },
  },
});
