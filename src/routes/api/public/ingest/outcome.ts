import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Post-call outcome from the Android live call screen.
 *
 * POST /api/public/ingest/outcome
 * Header: x-ingest-secret
 * Body: { lead_id, agent_id?, outcome, notes?, connected? }
 *
 * Moves the lead to the right stage, appends the agent's in-call notes and
 * bumps the attempt counter so the web queue matches the phone instantly.
 */
const OUTCOME_STAGE = {
  interested: "contacted",
  follow_up: "follow_up",
  not_interested: "closed",
  wrong_number: "closed",
  no_answer: "pending",
} as const;

const Body = z.object({
  lead_id: z.string().uuid(),
  agent_id: z.string().uuid().optional(),
  outcome: z.enum(["interested", "follow_up", "not_interested", "wrong_number", "no_answer"]),
  notes: z.string().max(4000).optional(),
  connected: z.boolean().optional(),
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

export const Route = createFileRoute("/api/public/ingest/outcome")({
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
        const { lead_id, outcome, notes, connected } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, notes, call_attempts")
          .eq("id", lead_id)
          .maybeSingle();
        if (!lead) return json({ error: "Unknown lead" }, 404);

        const stamp = new Date();
        const trimmed = notes?.trim();
        const appended = trimmed
          ? `${lead.notes ? `${lead.notes}\n\n` : ""}[${stamp.toISOString().slice(0, 16).replace("T", " ")}] ${trimmed}`
          : lead.notes;

        const { error } = await supabaseAdmin
          .from("leads")
          .update({
            status: OUTCOME_STAGE[outcome],
            outcome_category: outcome,
            notes: appended,
            call_attempts: (lead.call_attempts ?? 0) + 1,
            last_call_at: stamp.toISOString(),
            is_verified: connected === true ? true : undefined,
          })
          .eq("id", lead_id);
        if (error) return json({ error: error.message }, 500);

        return json({
          ok: true,
          lead_id,
          status: OUTCOME_STAGE[outcome],
          outcome,
          server_time: stamp.toISOString(),
        });
      },
    },
  },
});
