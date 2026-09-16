import { createFileRoute } from "@tanstack/react-router";

import apkAsset from "@/assets/winstone-connect.apk.asset.json";

/**
 * Verifiable facts about the file `/api/public/download/apk` actually serves.
 *
 * The checksum is not stored anywhere — it is computed from the exact bytes of
 * the served build, so it can never drift from reality or be back-filled by
 * hand. Hashing 17 MB is slow, so the result is memoised per worker instance
 * and keyed by the source and size it was computed from.
 */
type ApkInfo = {
  source: "published" | "bundled";
  size: number;
  sha256: string;
  filename: string;
};

let cached: ApkInfo | null = null;

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin.storage
          .from("app-downloads")
          .download("winstone-connect.apk");

        let source: ApkInfo["source"];
        let bytes: ArrayBuffer;

        if (data) {
          source = "published";
          bytes = await data.arrayBuffer();
        } else {
          if (!apkAsset?.url) return json({ available: false }, 404);
          source = "bundled";
          const res = await fetch(new URL(apkAsset.url, request.url));
          if (!res.ok) return json({ available: false }, 404);
          bytes = await res.arrayBuffer();
        }

        if (cached && cached.source === source && cached.size === bytes.byteLength) {
          return json({ available: true, ...cached });
        }

        cached = {
          source,
          size: bytes.byteLength,
          sha256: await sha256(bytes),
          filename: "winstone-connect.apk",
        };
        return json({ available: true, ...cached });
      },
    },
  },
});
