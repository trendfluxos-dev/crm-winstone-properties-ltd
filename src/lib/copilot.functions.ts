import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  adminToken: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
});

/** One turn of the Executive AI Copilot. PIN-gated: it can read and dispatch leads. */
export const askCopilot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { runCopilot } = await import("@/lib/copilot.server");
    return runCopilot(data.messages);
  });
