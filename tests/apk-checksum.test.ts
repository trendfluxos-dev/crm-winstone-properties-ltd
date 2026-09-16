import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/lib/apk-checksum.server";

/**
 * The public app-info endpoint must answer from persisted metadata, never by
 * re-reading the 17 MB build. These checks run against the live project the
 * other integration tests use.
 */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
const BASE = env?.["BASE_URL"] || "http://localhost:8080";

describe("apk checksum", () => {
  it("hashes bytes to a 64-character hex digest", async () => {
    const bytes = new TextEncoder().encode("winstone").buffer as ArrayBuffer;
    const hex = await sha256Hex(bytes);
    expect(hex).toMatch(/^[a-f0-9]{64}$/);
  });

  it("serves a persisted checksum for the build actually being downloaded", async () => {
    const res = await fetch(`${BASE}/api/public/download/apk-info`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      available: boolean;
      source: string;
      size: number;
      sha256: string;
      filename: string;
    };
    expect(body.available).toBe(true);
    expect(["published", "bundled"]).toContain(body.source);
    expect(body.size).toBeGreaterThan(1_000_000);
    expect(body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.filename).toBe("winstone-connect.apk");
  });

  it("stores that checksum durably, so repeat requests never rehash", async () => {
    await fetch(`${BASE}/api/public/download/apk-info`);

    const url = env?.["SUPABASE_URL"];
    const key = env?.["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !key) return; // no admin access in this environment

    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await admin
      .from("app_artifact_checksums")
      .select("artifact_key, sha256, size_bytes")
      .not("sha256", "is", null);

    expect(data?.length).toBeGreaterThan(0);
    expect(data?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns the same digest on a second request", async () => {
    const a = (await (await fetch(`${BASE}/api/public/download/apk-info`)).json()) as {
      sha256: string;
    };
    const b = (await (await fetch(`${BASE}/api/public/download/apk-info`)).json()) as {
      sha256: string;
    };
    expect(b.sha256).toBe(a.sha256);
  });
});
