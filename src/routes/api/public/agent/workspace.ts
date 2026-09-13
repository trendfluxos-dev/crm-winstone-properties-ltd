import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Agent Workspace feed for the Winstone Connect Android app.
 *
 * GET /api/public/agent/workspace?employee_id=WIN2601
 * Header: x-ingest-secret
 *
 * Returns the agent's profile, their leads, and their call / WhatsApp logs so the
 * app shows exactly what the web "My Leads" page shows for that agent.
 */
const Query = z.object({
  employee_id: z.string().trim().min(2).max(32).optional(),
  agent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/workspace")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return json({ error: "Invalid query" }, 400);
        const { limit } = parsed.data;
        // A phone may only ever read its own agent's workspace.
        const agent_id = caller.kind === "device" ? caller.profile.id : parsed.data.agent_id;
        const employee_id = caller.kind === "device" ? undefined : parsed.data.employee_id;
        if (!employee_id && !agent_id) {
          return json({ error: "employee_id or agent_id is required" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Roster: agent list so the app can offer an "Operating as" switcher too.
        const { data: roster } = await supabaseAdmin
          .from("profiles")
          .select("id, name, employee_id, phone, role, is_active")
          .eq("is_active", true)
          .order("name");

        const agent = (roster ?? []).find((p) =>
          agent_id ? p.id === agent_id : p.employee_id === employee_id,
        );
        if (!agent) return json({ error: "Unknown agent" }, 404);

        const { data: leads, error: leadsError } = await supabaseAdmin
          .from("leads")
          .select(
            "id, name, phone_number, company, notes, status, outcome_category, call_attempts, source, created_at, updated_at",
          )
          .or(`assigned_to.eq.${agent.id},assigned_agent_id.eq.${agent.id}`)
          .order("updated_at", { ascending: false })
          .limit(limit);
        if (leadsError) return json({ error: leadsError.message }, 500);

        const leadIds = (leads ?? []).map((l) => l.id);
        const [{ data: calls }, { data: messages }] = leadIds.length
          ? await Promise.all([
              supabaseAdmin
                .from("call_recordings")
                .select(
                  "id, lead_id, agent_id, phone_number, duration_seconds, call_direction, sync_status, is_two_sided, ai_summary, sentiment, deal_stage, created_at",
                )
                .in("lead_id", leadIds)
                .order("created_at", { ascending: false })
                .limit(limit),
              supabaseAdmin
                .from("whatsapp_interactions")
                .select("id, lead_id, agent_id, sender_type, message_type, message_content, created_at")
                .in("lead_id", leadIds)
                .order("created_at", { ascending: false })
                .limit(limit),
            ])
          : [{ data: [] }, { data: [] }];

        return json({
          ok: true,
          server_time: new Date().toISOString(),
          agent,
          roster: roster ?? [],
          leads: leads ?? [],
          calls: calls ?? [],
          whatsapp: messages ?? [],
        });
      },
    },
  },
});
