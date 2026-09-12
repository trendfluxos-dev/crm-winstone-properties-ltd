import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled shift summary: runs at 12:50, 13:50 and 17:30 Dhaka time, writes the
 * summary of the window that just closed and clears HQ's month on the 5th.
 * Caller must present the cron secret.
 */
export const Route = createFileRoute("/api/public/hooks/shift-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const accepted = [
          process.env["SHIFT_CRON_SECRET"],
          process.env["LOVABLE_CRON_SECRET"],
        ].filter((value): value is string => Boolean(value));
        const header =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";
        if (accepted.length === 0 || !accepted.includes(header)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { generateShiftSummary, purgeHqSummaries } = await import(
            "@/lib/shift-summary.server"
          );
          const summary = await generateShiftSummary();
          const purge = await purgeHqSummaries();
          return Response.json({ ok: true, summary, purge });
        } catch (error) {
          console.error("shift summary job failed", error);
          return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
