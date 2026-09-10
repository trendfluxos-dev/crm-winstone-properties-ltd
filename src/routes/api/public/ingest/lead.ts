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
    headers: { "Content-Type": "application/json" },
  });
}

const normalize = (p: string) => p.replace(/[^\d+]/g, "");

export const Route = createFileRoute("/api/public/ingest/lead")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const parsed = Payload.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "Invalid payload" }, 400);
        const body = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: existing } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("phone_number", body.phone_number.trim())
          .maybeSingle();
        if (existing) return json({ ok: true, duplicate: true, lead_id: existing.id }, 200);

        // Round-robin: hand the lead to whichever active agent currently owns the fewest.
        let assignedTo: string | null = null;
        if (body.assign) {
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

        const { data: inserted, error } = await supabaseAdmin
          .from("leads")
          .insert({
            name: body.name,
            phone_number: normalize(body.phone_number) || body.phone_number.trim(),
            company: body.company || null,
            notes: body.notes || null,
            source: body.source,
            assigned_to: assignedTo,
          })
          .select("id")
          .single();
        if (error) return json({ error: error.message }, 500);

        return json({ ok: true, lead_id: inserted.id, assigned_to: assignedTo }, 201);
      },
    },
  },
});
