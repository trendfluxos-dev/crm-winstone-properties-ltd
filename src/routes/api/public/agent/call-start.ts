import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * The next-lead lock.
 *
 * The phone must ask here before dialling. If the agent still has an unfinished
 * post-call report the server answers 409 with that report, so no outbound call
 * can start until the previous one is reported. The rule lives in the database
 * (one pending report per agent), so bypassing the UI does not bypass it.
 */
const Body = z.object({
  lead_id: z.string().uuid(),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/agent/call-start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { resolveApiCaller } = await import("@/lib/device-auth.server");
        const caller = await resolveApiCaller(request);
        if (caller.kind !== "device") return json({ error: "Unauthorized" }, 401);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "lead_id প্রয়োজন" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { pendingReportFor } = await import("@/lib/call-reports.server");

        const pending = await pendingReportFor(caller.profile.id);
        if (pending) {
          return json(
            {
              blocked: true,
              reason: "আগের কলের রিপোর্ট জমা দিন, তারপর পরের কল শুরু করা যাবে",
              report: pending,
            },
            409,
          );
        }

        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("id, name, phone_number, assigned_to, assigned_agent_id")
          .eq("id", parsed.data.lead_id)
          .maybeSingle();
        if (!lead) return json({ error: "Unknown lead" }, 404);
        if (leadHeldByOther(lead, caller.profile.id)) {
          return json({ error: LEAD_NOT_YOURS }, 403);
        }

        const { logLeadEvent } = await import("@/lib/lead-events.server");
        await logLeadEvent({
          leadId: lead.id,
          agentId: caller.profile.id,
          kind: "call_started",
          detail: `${caller.profile.name} কল শুরু করেছেন`,
        });

        return json({ ok: true, lead: { id: lead.id, name: lead.name, phone: lead.phone_number } });
      },
    },
  },
});
