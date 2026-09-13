import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import type { CallRecording, Lead, Profile, WhatsappMessage } from "@/lib/crm-data";
import { buildReport, defaultFilters, isoDay, reportToCsv } from "@/lib/crm-reports";
import { PROFILE_SAFE_COLUMNS } from "@/lib/profile-columns";

/**
 * Custom reports feed for the Winstone Connect Android app.
 *
 * GET /api/public/reports/summary?from=2026-08-01&to=2026-09-10&employee_id=WIN2601&format=json|csv
 * Header: x-ingest-secret
 *
 * Mirrors the web Custom Reports screen: totals, daily series, funnel/source/sentiment
 * mixes and the agent scorecard, computed by the same aggregation code.
 */
const Query = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  employee_id: z.string().trim().min(2).max(32).optional(),
  agent_id: z.string().uuid().optional(),
  source: z.string().trim().max(64).default("all"),
  status: z.enum(["all", "pending", "contacted", "follow_up", "closed"]).default("all"),
  format: z.enum(["json", "csv"]).default("json"),
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

export const Route = createFileRoute("/api/public/reports/summary")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return json({ error: "Invalid query" }, 400);
        const q = parsed.data;

        const base = defaultFilters(30);
        const from = q.from ?? base.from;
        const to = q.to ?? isoDay(new Date());
        if (from > to) return json({ error: "from must be on or before to" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const [profilesRes, leadsRes, callsRes, messagesRes] = await Promise.all([
          supabaseAdmin.from("profiles").select(PROFILE_SAFE_COLUMNS),
          supabaseAdmin.from("leads").select("*"),
          supabaseAdmin.from("call_recordings").select("*").gte("created_at", `${from}T00:00:00Z`),
          supabaseAdmin
            .from("whatsapp_interactions")
            .select("*")
            .gte("created_at", `${from}T00:00:00Z`),
        ]);
        const failed = [profilesRes, leadsRes, callsRes, messagesRes].find((r) => r.error);
        if (failed?.error) return json({ error: failed.error.message }, 500);

        const profiles = (profilesRes.data ?? []) as Profile[];
        let agentId: string | "all" = "all";
        if (q.agent_id || q.employee_id) {
          const agent = profiles.find((p) =>
            q.agent_id ? p.id === q.agent_id : p.employee_id === q.employee_id,
          );
          if (!agent) return json({ error: "Unknown agent" }, 404);
          agentId = agent.id;
        }

        const report = buildReport(
          {
            profiles,
            leads: (leadsRes.data ?? []) as Lead[],
            calls: (callsRes.data ?? []) as CallRecording[],
            messages: (messagesRes.data ?? []) as WhatsappMessage[],
          },
          { from, to, agentId, source: q.source, status: q.status },
        );

        if (q.format === "csv") {
          return new Response(`\uFEFF${reportToCsv(report)}`, {
            status: 200,
            headers: {
              "Content-Type": "text/csv;charset=utf-8",
              "Content-Disposition": `attachment; filename="winstone-report_${from}_to_${to}.csv"`,
              "Cache-Control": "no-store",
            },
          });
        }

        return json({
          ok: true,
          server_time: new Date().toISOString(),
          filters: report.filters,
          totals: report.totals,
          daily: report.daily,
          status_mix: report.statusMix,
          source_mix: report.sourceMix,
          sentiment_mix: report.sentimentMix,
          agents: report.rows,
        });
      },
    },
  },
});
