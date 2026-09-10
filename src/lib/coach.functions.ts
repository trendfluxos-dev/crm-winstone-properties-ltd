import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  token: z.string().nullable().optional(),
  agentId: z.string().uuid(),
});

/**
 * Real-time coaching for one agent.
 * Authority (master / IT PIN) can coach an agent. The client-provided agent
 * identifier is never accepted as proof of identity.
 */
export const getCoachBriefing = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { adminTokenValid } = await import("@/lib/admin-gate.server");
    const isAuthority = adminTokenValid(data.token ?? null);

    if (!isAuthority) throw new Error("Authority access is required for coaching data");

    const { buildCoachBriefing } = await import("@/lib/coach.server");
    return buildCoachBriefing(data.agentId);
  });
