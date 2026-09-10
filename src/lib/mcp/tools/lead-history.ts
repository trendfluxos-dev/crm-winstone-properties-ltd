import { ToolError, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { crmDb, requireAllowedUser, text } from "../access";

export default defineTool({
  name: "lead_history",
  title: "Lead history",
  description:
    "Full history of one lead: its details plus every call recording summary and WhatsApp message logged against it.",
  inputSchema: {
    lead_id: z.string().uuid().optional().describe("The lead's ID."),
    phone_number: z.string().trim().min(5).max(24).optional().describe("The lead's phone number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id, phone_number }, ctx) => {
    try {
      await requireAllowedUser(ctx);
      if (!lead_id && !phone_number) throw new ToolError("Give either lead_id or phone_number.");
      const db = await crmDb();

      const base = db
        .from("leads")
        .select(
          "id, name, phone_number, company, status, outcome_category, call_attempts, source, assigned_to, notes, created_at, updated_at",
        );
      const { data: lead, error } = lead_id
        ? await base.eq("id", lead_id).maybeSingle()
        : await base.eq("phone_number", phone_number!).maybeSingle();
      if (error) throw new ToolError(error.message);
      if (!lead) throw new ToolError("No lead matches that.");

      const [{ data: calls }, { data: messages }] = await Promise.all([
        db
          .from("call_recordings")
          .select(
            "id, agent_id, duration_seconds, call_direction, sentiment, deal_stage, ai_summary, created_at",
          )
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(100),
        db
          .from("whatsapp_interactions")
          .select("id, agent_id, sender_type, message_type, message_content, created_at")
          .eq("lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      return text({ lead, calls: calls ?? [], whatsapp: messages ?? [] });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
