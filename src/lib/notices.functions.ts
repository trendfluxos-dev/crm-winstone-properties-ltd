import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Authority-only system notices for the IT Console and Executive HQ. */
export const getSystemNotices = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { buildSystemNotices } = await import("@/lib/notices.server");
    return buildSystemNotices();
  });
