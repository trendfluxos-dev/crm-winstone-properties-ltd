import { createFileRoute } from "@tanstack/react-router";

/**
 * Post-publish smoke test.
 *
 * Verifies that the agent APK is present in storage and that the key CRM pages
 * respond. Read-only and safe for external monitors — it never returns lead or
 * user data, only route names and HTTP statuses.
 */
const ROUTES = ["/", "/auth", "/desk", "/dispatch", "/hq", "/system", "/import", "/docs"] as const;

type Check = {
  name: string;
  ok: boolean;
  status: number | null;
  detail: string;
};

export const Route = createFileRoute("/api/public/smoke")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const checks: Check[] = [];

        // 1. APK availability (storage metadata only — no 12 MB download)
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data, error } = await supabaseAdmin.storage
            .from("app-downloads")
            .list("", { search: "winstone-connect.apk", limit: 1 });
          const file = data?.find((f) => f.name === "winstone-connect.apk");
          const size = (file?.metadata as { size?: number } | null | undefined)?.size ?? 0;
          checks.push({
            name: "/api/public/download/apk",
            ok: Boolean(file) && size > 0 && !error,
            status: file ? 200 : 404,
            detail: file
              ? `অ্যাপ ফাইল আছে — ${(size / (1024 * 1024)).toFixed(1)} MB`
              : "অ্যাপ ফাইল স্টোরেজে পাওয়া যায়নি",
          });
        } catch (err) {
          checks.push({
            name: "/api/public/download/apk",
            ok: false,
            status: null,
            detail: err instanceof Error ? err.message : "স্টোরেজ পড়া যায়নি",
          });
        }

        // 2. Key CRM routes respond
        await Promise.all(
          ROUTES.map(async (path) => {
            try {
              const res = await fetch(`${origin}${path}`, {
                method: "GET",
                headers: { "x-smoke-test": "1" },
                redirect: "manual",
              });
              checks.push({
                name: path,
                ok: res.status < 400,
                status: res.status,
                detail: res.status < 400 ? "পেজ ঠিকভাবে সাড়া দিচ্ছে" : "পেজ সাড়া দিচ্ছে না",
              });
            } catch (err) {
              checks.push({
                name: path,
                ok: false,
                status: null,
                detail: err instanceof Error ? err.message : "রিকোয়েস্ট ব্যর্থ",
              });
            }
          }),
        );

        checks.sort((a, b) => a.name.localeCompare(b.name));
        const failed = checks.filter((c) => !c.ok);

        return Response.json(
          {
            ok: failed.length === 0,
            origin,
            checkedAt: new Date().toISOString(),
            passed: checks.length - failed.length,
            total: checks.length,
            checks,
          },
          {
            status: failed.length === 0 ? 200 : 503,
            headers: { "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
