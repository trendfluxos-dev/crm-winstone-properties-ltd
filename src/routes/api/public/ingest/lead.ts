import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Webhook payload from website forms / Facebook lead ads. */
const Payload = z.object({
  name: z.string().trim().min(1).max(120),
  phone_number: z.string().trim().min(6).max(24),
  company: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  source: z.string().trim().max(40).default("webhook"),
  assign: z.boolean().default(true),
  /** Profile id of the agent adding their own lead from the phone app. */
  agent_id: z.string().uuid().nullable().optional(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const normalize = (p: string) => p.replace(/[^\d+]/g, "");

export const Route = createFileRoute("/api/public/ingest/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind === "none") return json({ error: "Unauthorized" }, 401);

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // An agent adding their own lead keeps it — no approval, no round-robin.
        let assignedTo: string | null = null;
        let ownerName: string | null = null;
        const requestedAgentId = caller.kind === "device" ? caller.profile.id : body.agent_id;
        if (requestedAgentId) {
          const { data: agent } = await supabaseAdmin
            .from("profiles")
            .select("id, name")
            .eq("id", requestedAgentId)
            .eq("is_active", true)
            .in("role", ["agent", "team_leader"])
            .maybeSingle();
          if (agent) {
            assignedTo = agent.id;
            ownerName = agent.name;
          }
        }

        // Round-robin: hand the lead to whichever active agent currently owns the fewest.
        if (!assignedTo && body.assign) {
          const [{ data: agents }, { data: openLeads }] = await Promise.all([
            supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("is_active", true)
              .in("role", ["agent", "team_leader"])
              .order("name"),
            supabaseAdmin.from("leads").select("assigned_to").neq("status", "closed"),
          ]);
          if (agents?.length) {
            const load = new Map(agents.map((a) => [a.id, 0]));
            for (const lead of openLeads ?? []) {
              if (lead.assigned_to && load.has(lead.assigned_to)) {
                load.set(lead.assigned_to, (load.get(lead.assigned_to) ?? 0) + 1);
              }
            }
            assignedTo = [...load.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;
          }
        }

        // Shared intake with the web desk: identical result either way.
        const { intakeLead } = await import("@/lib/lead-intake.server");
        try {
          const result = await intakeLead({
            name: body.name,
            phoneNumber: body.phone_number,
            company: body.company ?? null,
            notes: body.notes ?? null,
            ownerId: assignedTo,
            ownerName,
            source: body.source,
          });
          if (result.duplicate) {
            return json({ ok: true, duplicate: true, lead_id: result.leadId }, 200);
          }
          return json({ ok: true, lead_id: result.leadId, assigned_to: result.assignedTo }, 201);
        } catch (err) {
          return json({ error: err instanceof Error ? err.message : "Insert failed" }, 500);
        }
      },
    },
  },
});
