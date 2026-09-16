import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** The signed-in agent's own Dhaka-day performance. Real rows only. */
export const getMyDailyPerformance = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    if (caller.scope === "none" || !caller.profile) {
      throw new Error("অনুমোদিত অ্যাকাউন্ট দিয়ে সাইন ইন করুন");
    }
    const { computeDailyPerformance } = await import("@/lib/daily-performance.server");
    return computeDailyPerformance(caller.profile.id);
  });
