import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Executive HQ presentation. Built purely from the agents' own submitted
 * updates, so this surface never carries technical status.
 */
export const executiveBrief = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    requireDispatch(await resolveCaller(data.adminToken ?? null));
    const { executiveBriefNow } = await import("@/lib/hq-brief.server");
    return executiveBriefNow();
  });
