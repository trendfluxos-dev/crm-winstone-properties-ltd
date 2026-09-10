import { ToolError, defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { crmDb, requireAllowedUser, text } from "../access";

/** Normalises Bangladeshi numbers the same way the ingest endpoints do. */
function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("880")) return `+${digits}`;
  if (digits.startsWith("0")) return `+88${digits}`;
  return digits;
}

export default defineTool({
  name: "create_lead",
  title: "Create a lead",
  description:
    "Add a new lead to the CRM. Optionally assign it to an agent by employee ID; otherwise it stays unassigned.",
  inputSchema: {
    name: z.string().trim().min(2).max(120),
    phone_number: z.string().trim().min(5).max(24),
    company: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2000).optional(),
    source: z.string().trim().max(40).default("mcp"),
    employee_id: z.string().trim().min(2).max(32).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ name, phone_number, company, notes, source, employee_id }, ctx) => {
    try {
      const email = await requireAllowedUser(ctx);
      const db = await crmDb();
      const phone = normalisePhone(phone_number);

      const { data: existing } = await db
        .from("leads")
        .select("id, name, status")
        .eq("phone_number", phone)
        .maybeSingle();
      if (existing) return text({ duplicate: true, message: "This phone number is already a lead.", lead: existing });

      let assignedTo: string | null = null;
      if (employee_id) {
        const { data: agent } = await db.from("profiles").select("id").eq("employee_id", employee_id).maybeSingle();
        if (!agent) throw new ToolError(`No agent with employee ID ${employee_id}.`);
        assignedTo = agent.id;
      }

      const { data, error } = await db
        .from("leads")
        .insert({
          name,
          phone_number: phone,
          company: company ?? null,
          notes: notes ? `${notes}\n\n(added via agent integration by ${email})` : `Added via agent integration by ${email}`,
          source,
          assigned_to: assignedTo,
          status: "new",
        })
        .select("id, name, phone_number, status, assigned_to, created_at")
        .single();
      if (error) throw new ToolError(error.message);

      return text({ created: true, lead: data });
    } catch (error) {
      throw error instanceof ToolError ? error : new ToolError((error as Error).message);
    }
  },
});
