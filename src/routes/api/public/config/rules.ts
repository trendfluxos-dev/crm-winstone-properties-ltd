import { createFileRoute } from "@tanstack/react-router";

import { parseConfig } from "@/lib/crm-config";

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
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);
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
