import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Live presence beacon for the Winstone Connect Android in-call screen.
 *
 * POST /api/public/agent/presence
 * Header: x-ingest-secret
 * Body: { employee_id? , agent_id? , presence: "on_call" | "idle" | "offline",
 *         call_started_at?: ISO string }
 *
 * The phone posts "on_call" the moment the dialer goes off-hook and "idle" when
 * the call ends, so the Executive HQ floor radar shows the rolling call timer in
 * real time instead of waiting for the recording upload.
 */
const Body = z.object({
  employee_id: z.string().trim().min(2).max(32).optional(),
  agent_id: z.string().uuid().optional(),
  presence: z.enum(["on_call", "idle", "offline"]),
  call_started_at: z.string().datetime({ offset: true }).optional(),
  lead_id: z.string().uuid().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/presence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const parsed = Body.safeParse(raw);
        if (!parsed.success) {
          return json({ error: "Invalid payload", issues: parsed.error.issues }, 400);
        }
        const { presence, call_started_at, lead_id } = parsed.data;
        const agent_id = caller.kind === "device" ? caller.profile.id : parsed.data.agent_id;
        const employee_id = caller.kind === "device" ? undefined : parsed.data.employee_id;
        if (!employee_id && !agent_id) {
          return json({ error: "employee_id or agent_id is required" }, 400);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const lookup = supabaseAdmin.from("profiles").select("id, name, employee_id");
        const { data: agent } = agent_id
          ? await lookup.eq("id", agent_id).maybeSingle()
          : await lookup.eq("employee_id", employee_id!).maybeSingle();
        if (!agent) return json({ error: "Unknown agent" }, 404);

        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            presence,
            current_call_started_at: presence === "on_call" ? (call_started_at ?? now) : null,
            last_active_at: now,
          })
          .eq("id", agent.id);
        if (error) return json({ error: error.message }, 500);

        if (lead_id) {
          const { logLeadEvent } = await import("@/lib/lead-events.server");
          if (presence === "on_call") {
            await logLeadEvent({
              leadId: lead_id,
              agentId: agent.id,
              kind: "call_started",
              detail: `${agent.name} ফোন থেকে ডায়াল করেছেন`,
            });
          } else {
            await logLeadEvent({
              leadId: lead_id,
              agentId: agent.id,
              kind: "call_ended",
              detail: "কল শেষ — রেকর্ডিং আপলোডের অপেক্ষায়",
            });
          }
        }

        return json({ ok: true, agent, presence, server_time: now });
      },
    },
  },
});
