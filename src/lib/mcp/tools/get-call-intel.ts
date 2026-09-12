import { ToolError, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { crmDb, requireAllowedUser, text } from "../access";

export default defineTool({
  name: "get_call_intel",
  title: "Call intelligence",
  description:
    "Call recordings for one lead: duration, sync status, AI summary, sentiment, deal stage and transcript for each synced call.",
  inputSchema: {
    lead_id: z.string().uuid().optional().describe("The lead's ID."),
    phone_number: z.string().trim().min(5).max(24).optional().describe("The lead's phone number."),
    limit: z.number().int().min(1).max(50).optional().describe("Max recordings to return (default 5)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ lead_id, phone_number, limit }, ctx) => {
    try {
      await requireAllowedUser(ctx);
      if (!lead_id && !phone_number) throw new ToolError("Give either lead_id or phone_number.");
      const db = await crmDb();

      const base = db.from("leads").select("id, name, phone_number, status");
      const { data: lead, error: leadError } = lead_id
        ? await base.eq("id", lead_id).maybeSingle()
        : await base.eq("phone_number", phone_number!).maybeSingle();
      if (leadError) throw new ToolError(leadError.message);
      if (!lead) throw new ToolError("No lead matches that.");

      const { data: recordings, error: recError } = await db
        .from("call_recordings")
        .select(
          "id, agent_id, phone_number, call_direction, duration_seconds, is_two_sided, sync_status, transcription_text, ai_summary, sentiment, customer_objections, deal_stage, created_at",
        )
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(limit ?? 5);
      if (recError) throw new ToolError(recError.message);

      return text({
        lead,
        count: recordings?.length ?? 0,
        recordings: recordings ?? [],
      });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
