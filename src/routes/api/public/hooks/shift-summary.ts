import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled shift summary: runs at 12:50 and 17:30 Dhaka time, writes the
 * summary of the window that just closed and clears HQ's month on the 5th.
 * Caller must present the cron secret.
 */
export const Route = createFileRoute("/api/public/hooks/shift-summary")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const header =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
          "";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // The database scheduler reads its own shared secret from settings, so the
        // schedule can be created without ever exposing an environment value.
        const { data: stored } = await supabaseAdmin
          .from("system_settings")
          .select("value")
          .eq("key", "shift_cron_secret")
          .maybeSingle();
        const storedSecret =
          stored && typeof stored.value === "object" && stored.value !== null
            ? (stored.value as { secret?: string }).secret
            : undefined;

        const accepted = [
          process.env["SHIFT_CRON_SECRET"],
          process.env["LOVABLE_CRON_SECRET"],
          storedSecret,
        ].filter((value): value is string => Boolean(value));
        if (accepted.length === 0 || !header || !accepted.includes(header)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { generateShiftSummary, purgeHqSummaries, backfillShiftSummaries } = await import(
            "@/lib/shift-summary.server"
          );
          const summary = await generateShiftSummary();
          // Catches up any earlier window the schedule missed.
          await backfillShiftSummaries(3);
          const purge = await purgeHqSummaries();

          // Daily recording index in Google Docs for the current Dhaka day.
          let recordingDoc: unknown = null;
          try {
            const { syncRecordingDoc } = await import("@/lib/recording-doc.server");
            const dateKey = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
            const doc = await syncRecordingDoc(dateKey);
            recordingDoc = { dateKey, docUrl: doc.docUrl, calls: doc.calls };
          } catch (error) {
            console.error("recording doc sync failed", error);
            recordingDoc = { error: error instanceof Error ? error.message : "failed" };
          }

          return Response.json({ ok: true, summary, purge, recordingDoc });
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
