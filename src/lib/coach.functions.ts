import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  token: z.string().nullable().optional(),
  agentId: z.string().uuid(),
});

/**
 * Real-time coaching for one agent.
 * Authority and coordinators may coach anyone; a signed-in agent may only ask
 * for their own briefing. A client-supplied id is never proof of identity.
 */
export const getCoachBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.token ?? null);

    if (caller.scope === "none") throw new Error("Sign in to see coaching data");
    const agentId =
      caller.scope === "agent" ? (caller.profile?.id ?? "") : data.agentId;
    if (!agentId) throw new Error("No agent profile found");

    const { buildCoachBriefing } = await import("@/lib/coach.server");
    return buildCoachBriefing(agentId);
  });
