import { createFileRoute } from "@tanstack/react-router";

import apkAsset from "@/assets/winstone-connect.apk.asset.json";

/**
 * Verifiable facts about the file `/api/public/download/apk` actually serves.
 *
 * The digest itself is persisted next to the build (see apk-checksum.server);
 * this route only reads it, so a normal request never rehashes the APK. No
 * storage path, bucket key or credential is ever returned.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/download/apk-info")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getApkChecksum } = await import("@/lib/apk-checksum.server");
        const bundled = apkAsset?.url ? { url: apkAsset.url, size: apkAsset.size } : null;
        const entry = await getApkChecksum(bundled, request.url);

        if (!entry) return json({ available: false }, 404);

        return json({
          available: true,
          source: entry.source,
          size: entry.size,
          sha256: entry.sha256,
          filename: entry.filename,
        });
      },
    },
  },
});
