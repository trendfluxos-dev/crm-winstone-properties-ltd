import { ToolError, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { crmDb, requireAllowedUser, text } from "../access";

export default defineTool({
  name: "floor_summary",
  title: "Sales floor summary",
  description:
    "Activity summary for the last N days: calls, talk time, WhatsApp messages, lead stage mix and a per-agent scorecard.",
  inputSchema: {
    days: z.number().int().min(1).max(90).default(7).describe("How many days back to summarise."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    try {
      await requireAllowedUser(ctx);
      const db = await crmDb();
      const since = new Date(Date.now() - days * 86_400_000).toISOString();

      const [{ data: agents }, { data: calls }, { data: messages }, { data: leads }] =
        await Promise.all([
          db.from("profiles").select("id, name, employee_id, role, is_active"),
          db
            .from("call_recordings")
            .select("id, agent_id, duration_seconds, sentiment, created_at")
            .gte("created_at", since),
          db
            .from("whatsapp_interactions")
            .select("id, agent_id, created_at")
            .gte("created_at", since),
          db.from("leads").select("id, status, source, assigned_to, updated_at"),
        ]);

      const stageMix: Record<string, number> = {};
      for (const lead of leads ?? [])
        stageMix[lead.status ?? "unknown"] = (stageMix[lead.status ?? "unknown"] ?? 0) + 1;

      const scorecard = (agents ?? []).map((agent) => {
        const agentCalls = (calls ?? []).filter((c) => c.agent_id === agent.id);
        const talkSeconds = agentCalls.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0);
        return {
          name: agent.name,
          employee_id: agent.employee_id,
          role: agent.role,
          is_active: agent.is_active,
          calls: agentCalls.length,
          talk_minutes: Math.round(talkSeconds / 60),
          whatsapp_messages: (messages ?? []).filter((m) => m.agent_id === agent.id).length,
          leads_owned: (leads ?? []).filter((l) => l.assigned_to === agent.id).length,
        };
      });

      return text({
        window_days: days,
        totals: {
          calls: calls?.length ?? 0,
          talk_minutes: Math.round(
            (calls ?? []).reduce((s, c) => s + (c.duration_seconds ?? 0), 0) / 60,
          ),
          whatsapp_messages: messages?.length ?? 0,
          leads: leads?.length ?? 0,
        },
        lead_stage_mix: stageMix,
        agents: scorecard.sort((a, b) => b.calls - a.calls),
      });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
