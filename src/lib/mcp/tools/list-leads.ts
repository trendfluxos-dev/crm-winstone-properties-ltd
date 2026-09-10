import { ToolError, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { crmDb, requireAllowedUser, text } from "../access";

export default defineTool({
  name: "list_leads",
  title: "List leads",
  description:
    "List leads, newest activity first. Filter by stage, source, assigned employee ID or a name/phone search.",
  inputSchema: {
    status: z
      .enum(["pending", "contacted", "follow_up", "closed"])
      .optional()
      .describe("Lead stage."),
    source: z.string().trim().min(1).max(40).optional().describe("Where the lead came from."),
    employee_id: z.string().trim().min(2).max(32).optional().describe("Only leads of this agent."),
    search: z.string().trim().min(2).max(60).optional().describe("Match on lead name or phone number."),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, source, employee_id, search, limit }, ctx) => {
    try {
      await requireAllowedUser(ctx);
      const db = await crmDb();

      let assignedTo: string | undefined;
      if (employee_id) {
        const { data: agent } = await db
          .from("profiles")
          .select("id")
          .eq("employee_id", employee_id)
          .maybeSingle();
        if (!agent) throw new ToolError(`No agent with employee ID ${employee_id}.`);
        assignedTo = agent.id;
      }

      let query = db
        .from("leads")
        .select(
          "id, name, phone_number, company, status, outcome_category, call_attempts, source, assigned_to, notes, created_at, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (status) query = query.eq("status", status);
      if (source) query = query.eq("source", source);
      if (assignedTo) query = query.eq("assigned_to", assignedTo);
      if (search) query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);

      const { data, error } = await query;
      if (error) throw new ToolError(error.message);
      return text({ count: data?.length ?? 0, leads: data ?? [] });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
