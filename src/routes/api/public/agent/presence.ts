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
});

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

export const Route = createFileRoute("/api/public/agent/presence")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

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
        const { employee_id, agent_id, presence, call_started_at } = parsed.data;
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
            current_call_started_at:
              presence === "on_call" ? (call_started_at ?? now) : null,
            last_active_at: now,
          })
          .eq("id", agent.id);
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, agent, presence, server_time: now });
      },
    },
  },
});
