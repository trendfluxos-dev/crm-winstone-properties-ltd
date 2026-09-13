import type { ToolContext } from "@lovable.dev/mcp-js";

import { parseConfig } from "@/lib/crm-config";

/**
 * Every MCP tool runs for a signed-in person. Access is granted only when the
 * verified email of that person appears in the IT Console allow-list
 * (app_config.mcpAllowedEmails). An empty list denies everybody.
 */
export async function requireAllowedUser(ctx: ToolContext): Promise<string> {
  if (!ctx.isAuthenticated()) throw new Error("Sign in first — this endpoint requires an account.");
  const email = ctx.getUserEmail()?.trim().toLowerCase();
  if (!email) throw new Error("Your account has no verified email address, so access is denied.");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("data")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);

  const allowed = parseConfig(data?.data ?? {}).mcpAllowedEmails;
  if (!allowed.includes(email)) {
    throw new Error(
      `${email} is not on the approved list. Add it in the IT Console → Customizer → Agent integrations, then try again.`,
    );
  }
  return email;
}

/** Service-role client, only reachable after requireAllowedUser() succeeded. */
export async function crmDb() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function text(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}
