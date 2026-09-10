import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  token: z.string().nullable().optional(),
  operatorId: z.string().uuid().nullable().optional(),
  agentId: z.string().uuid(),
});

/**
 * Real-time coaching for one agent.
 * Authority (master / IT PIN) can coach anyone; an agent can only ever
 * request their own briefing, and only while the AI Coach permission is on.
 */
export const getCoachBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { adminTokenValid } = await import("@/lib/admin-gate.server");
    const isAuthority = adminTokenValid(data.token ?? null);

    if (!isAuthority) {
      if (!data.operatorId || data.operatorId !== data.agentId) {
        throw new Error("You can only open your own coaching briefing");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { parseConfig } = await import("@/lib/crm-config");
      const { data: row } = await supabaseAdmin
        .from("app_config")
        .select("data")
        .eq("id", "default")
        .maybeSingle();
      if (!parseConfig(row?.data ?? {}).permissions.agentCanUseAiCoach) {
        throw new Error("The AI Coach is switched off by IT for agent devices");
      }
    }

    const { buildCoachBriefing } = await import("@/lib/coach.server");
    return buildCoachBriefing(data.agentId);
  });
