/**
 * Durable SHA-256 for the Android build that `/api/public/download/apk` serves.
 *
 * Hashing a 17 MB file per request is far too slow, and a worker-local cache
 * dies on every deploy. The digest therefore lives in `app_artifact_checksums`,
 * one row per artifact ("published" = the build IT uploaded, "bundled" = the
 * fallback build shipped with the project). It is written once at upload time;
 * the public endpoint only ever reads that row.
 *
 * Legacy builds uploaded before this existed are backfilled once, on a genuine
 * cache miss. The row itself is the lock: the backfiller claims it with an
 * insert that does nothing on conflict, so concurrent first requests cannot
 * both hash the same file. A claim older than STALE_CLAIM_MS is reclaimed, so a
 * worker dying mid-hash cannot wedge the artifact forever.
 */
const BUCKET = "app-downloads";
const APK_NAME = "winstone-connect.apk";
const STALE_CLAIM_MS = 5 * 60 * 1000;

export type ApkChecksum = {
  source: "published" | "bundled";
  size: number;
  sha256: string;
  filename: string;
};

/** Optional secondary optimisation only — the durable row above is the real cache. */
const memo = new Map<string, ApkChecksum>();
const inFlight = new Map<string, Promise<ApkChecksum | null>>();

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Row = {
  artifact_key: string;
  source: string;
  filename: string;
  size_bytes: number | null;
  sha256: string | null;
  claimed_at: string;
};

function toChecksum(row: Row): ApkChecksum | null {
  if (!row.sha256 || row.size_bytes === null) return null;
  return {
    source: row.source === "published" ? "published" : "bundled",
    size: Number(row.size_bytes),
    sha256: row.sha256,
    filename: row.filename,
  };
}

async function readRow(key: string): Promise<Row | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_artifact_checksums")
    .select("artifact_key, source, filename, size_bytes, sha256, claimed_at")
    .eq("artifact_key", key)
    .maybeSingle();
  return (data as Row | null) ?? null;
}

async function persist(key: string, entry: ApkChecksum): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_artifact_checksums").upsert(
    {
      artifact_key: key,
      source: entry.source,
      filename: entry.filename,
      size_bytes: entry.size,
      sha256: entry.sha256,
      computed_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
    },
    { onConflict: "artifact_key" },
  );
  memo.set(key, entry);
}

/**
 * Called right after a new build is uploaded, so no user ever pays for the hash.
 */
export async function storeApkChecksum(bytes: ArrayBuffer): Promise<ApkChecksum> {
  const entry: ApkChecksum = {
    source: "published",
    size: bytes.byteLength,
    sha256: await sha256Hex(bytes),
    filename: APK_NAME,
  };
  await persist("published", entry);
  return entry;
}

/**
 * Tries to become the one worker that hashes this artifact. Returns false when
 * another worker holds a fresh claim.
 */
async function claim(key: string, source: ApkChecksum["source"]): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from("app_artifact_checksums").insert({
    artifact_key: key,
    source,
    filename: APK_NAME,
    claimed_at: now,
  });
  if (!error) return true;

  // Row already exists: take it over only if the previous claim went stale.
  const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("app_artifact_checksums")
    .update({ claimed_at: now })
    .eq("artifact_key", key)
    .is("sha256", null)
    .lt("claimed_at", stale)
    .select("artifact_key");
  return Boolean(data?.length);
}

/** Does a published build exist in storage? Metadata listing only — no bytes read. */
async function publishedExists(): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.storage.from(BUCKET).list("", { search: APK_NAME });
  return Boolean(data?.some((item) => item.name === APK_NAME));
}

async function hashArtifact(
  source: ApkChecksum["source"],
  bundled: { url: string; size: number } | null,
  requestUrl: string,
): Promise<ArrayBuffer | null> {
  if (source === "published") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.storage.from(BUCKET).download(APK_NAME);
    return data ? await data.arrayBuffer() : null;
  }
  if (!bundled) return null;
  const res = await fetch(new URL(bundled.url, requestUrl));
  return res.ok ? await res.arrayBuffer() : null;
}

/**
 * Returns the stored digest for the build currently being served.
 *
 * Happy path: one small row read, no storage access, no APK bytes touched.
 */
export async function getApkChecksum(
  bundled: { url: string; size: number } | null,
  requestUrl: string,
): Promise<ApkChecksum | null> {
  for (const key of ["published", "bundled"] as const) {
    const remembered = memo.get(key);
    if (remembered) return remembered;

    const row = await readRow(key);
    const entry = row ? toChecksum(row) : null;
    if (entry) {
      memo.set(key, entry);
      return entry;
    }
  }

  // Nothing persisted yet — decide which artifact is actually being served and
  // backfill it exactly once.
  const source: ApkChecksum["source"] = (await publishedExists()) ? "published" : "bundled";
  const key = source;

  const running = inFlight.get(key);
  if (running) return running;

  const task = (async (): Promise<ApkChecksum | null> => {
    if (!(await claim(key, source))) {
      // Another worker is hashing it; the next request will find the row.
      return null;
    }
    const bytes = await hashArtifact(source, bundled, requestUrl);
    if (!bytes) return null;
    const entry: ApkChecksum = {
      source,
      size: bytes.byteLength,
      sha256: await sha256Hex(bytes),
      filename: APK_NAME,
    };
    await persist(key, entry);
    return entry;
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, task);
  return task;
}
