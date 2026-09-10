import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Executive HQ "ask anything" — returns an insight plus a chart spec. */
export const askHq = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string().nullable().optional(),
        question: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { askFloorQuestion } = await import("@/lib/hq-ask.server");
    return askFloorQuestion(data.question);
  });
