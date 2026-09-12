import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Query = z.object({
  employee_id: z.string().trim().min(1).max(32).optional(),
  agent_id: z.string().uuid().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** AI coaching for the agent using the phone app. Own data only. */
export const Route = createFileRoute("/api/public/agent/coach")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const parsed = Query.safeParse(
          caller.kind === "device"
            ? { agent_id: caller.profile.id }
            : {
                employee_id: url.searchParams.get("employee_id") ?? undefined,
                agent_id: url.searchParams.get("agent_id") ?? undefined,
              },
        );
        if (!parsed.success) return json({ error: "Invalid query" }, 400);
        if (!parsed.data.employee_id && !parsed.data.agent_id) {
          return json({ error: "Send employee_id or agent_id" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { parseConfig } = await import("@/lib/crm-config");

        const [profileRes, configRes] = await Promise.all([
          parsed.data.agent_id
            ? supabaseAdmin.from("profiles").select("id").eq("id", parsed.data.agent_id).maybeSingle()
            : supabaseAdmin
                .from("profiles")
                .select("id")
                .eq("employee_id", parsed.data.employee_id!)
                .maybeSingle(),
          supabaseAdmin.from("app_config").select("data").eq("id", "default").maybeSingle(),
        ]);
        if (profileRes.error) return json({ error: profileRes.error.message }, 500);
        if (!profileRes.data) return json({ error: "Unknown agent" }, 404);
        if (!parseConfig(configRes.data?.data ?? {}).permissions.agentCanUseAiCoach) {
          return json({ error: "AI Coach is switched off by IT" }, 403);
        }

        const { buildCoachBriefing } = await import("@/lib/coach.server");
        try {
          return json({ ok: true, briefing: await buildCoachBriefing(profileRes.data.id) });
        } catch (error) {
          console.error("agent coach failed", error);
          return json({ error: "Could not build the coaching briefing" }, 502);
        }
      },
    },
  },
});
