/**
 * Durable SHA-256 for the Android build that `/api/public/download/apk` serves.
 *
 * Hashing a 17 MB file per request is far too slow, and a worker-local cache
 * dies on every deploy. The digest is therefore stored as a tiny sidecar object
 * in the same private "app-downloads" bucket as the build itself, keyed by the
 * source and byte size it was computed from — so it survives restarts, and it
 * can never be served for a file it does not belong to.
 *
 * Written once when IT publishes a release; computed lazily only when a build
 * exists with no sidecar yet (backfill for builds published before this, and
 * for the bundled fallback APK).
 */
const BUCKET = "app-downloads";
const APK_NAME = "winstone-connect.apk";
const SIDECAR_PREFIX = "checksums";

export type ApkChecksum = {
  source: "published" | "bundled";
  size: number;
  sha256: string;
  filename: string;
  computed_at: string;
};

/** Per-instance dedupe so a burst of first requests hashes the file once, not N times. */
const inFlight = new Map<string, Promise<ApkChecksum | null>>();
/** Short-lived memo of the durable sidecar, purely to save a storage round-trip. */
const memo = new Map<string, ApkChecksum>();

function sidecarPath(source: ApkChecksum["source"], size: number) {
  return `${SIDECAR_PREFIX}/${source}-${size}.json`;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readSidecar(
  source: ApkChecksum["source"],
  size: number,
): Promise<ApkChecksum | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(BUCKET).download(sidecarPath(source, size));
  if (!data) return null;
  try {
    const parsed = JSON.parse(await data.text()) as ApkChecksum;
    return parsed.sha256 && parsed.size === size ? parsed : null;
  } catch {
    return null;
  }
}

async function writeSidecar(entry: ApkChecksum): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage
    .from(BUCKET)
    .upload(sidecarPath(entry.source, entry.size), JSON.stringify(entry), {
      contentType: "application/json",
      upsert: true,
      cacheControl: "no-cache",
    });
}

/** Called right after a new build is uploaded, so no user ever pays for the hash. */
export async function storeApkChecksum(bytes: ArrayBuffer): Promise<ApkChecksum> {
  const entry: ApkChecksum = {
    source: "published",
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    filename: APK_NAME,
    computed_at: new Date().toISOString(),
  };
  await writeSidecar(entry);
  return entry;
}

/** Byte size of the published build, without downloading it. */
async function publishedSize(): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(BUCKET).list("", { search: APK_NAME });
  const row = data?.find((item) => item.name === APK_NAME);
  const size = (row?.metadata as { size?: number } | null | undefined)?.size;
  return typeof size === "number" ? size : null;
}

async function backfill(
  source: ApkChecksum["source"],
  size: number,
  load: () => Promise<ArrayBuffer | null>,
): Promise<ApkChecksum | null> {
  const bytes = await load();
  if (!bytes) return null;
  const entry: ApkChecksum = {
    source,
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    filename: APK_NAME,
    computed_at: new Date().toISOString(),
  };
  await writeSidecar(entry);
  return entry;
}

/**
 * Returns the stored digest for the build currently being served, computing and
 * persisting it only on a genuine cache miss.
 */
export async function getApkChecksum(
  bundled: { url: string; size: number } | null,
  requestUrl: string,
): Promise<ApkChecksum | null> {
  const published = await publishedSize();

  const source: ApkChecksum["source"] = published !== null ? "published" : "bundled";
  const size = published ?? bundled?.size ?? 0;
  if (!size) return null;

  const key = `${source}-${size}`;
  const remembered = memo.get(key);
  if (remembered) return remembered;

  const stored = await readSidecar(source, size);
  if (stored) {
    memo.set(key, stored);
    return stored;
  }

  const running = inFlight.get(key);
  if (running) return running;

  const task = backfill(source, size, async () => {
    if (source === "published") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin.storage.from(BUCKET).download(APK_NAME);
      return data ? await data.arrayBuffer() : null;
    }
    if (!bundled) return null;
    const res = await fetch(new URL(bundled.url, requestUrl));
    return res.ok ? await res.arrayBuffer() : null;
  }).finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}
