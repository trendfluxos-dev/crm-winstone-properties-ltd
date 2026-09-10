import { ToolError, defineTool } from "@lovable.dev/mcp-js";

import { crmDb, requireAllowedUser, text } from "../access";

export default defineTool({
  name: "list_agents",
  title: "List sales agents",
  description:
    "List the sales floor roster with each agent's employee ID, role, live presence and active state.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    try {
      await requireAllowedUser(ctx);
      const db = await crmDb();
      const { data, error } = await db
        .from("profiles")
        .select("id, name, employee_id, role, is_active, presence, last_active_at")
        .order("name");
      if (error) throw new ToolError(error.message);
      return text({ agents: data ?? [] });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
