#!/usr/bin/env node
/**
 * Production smoke test for Winstone Connect.
 *
 * Checks that every main screen answers and that the Android app file is really
 * downloadable — a HEAD probe plus a real ranged GET of the first bytes, so a
 * dead storage path or a broken redirect fails here instead of in an agent's
 * hands.
 *
 *   node scripts/smoke.mjs                                          # local dev server
 *   SMOKE_BASE_URL=https://crm-v2.winstonebd.com node scripts/smoke.mjs
 *
 * SMOKE_BASE_URL is the one variable CI sets. Set SMOKE_REQUIRE_BASE_URL=1 when
 * a deployed target is mandatory: the run then fails instead of quietly testing
 * localhost and reporting a green release.
 */

const raw = (process.env.SMOKE_BASE_URL ?? "").trim();
const required = ["1", "true", "yes"].includes((process.env.SMOKE_REQUIRE_BASE_URL ?? "").toLowerCase());

if (required && !/^https?:\/\//.test(raw)) {
  console.error(
    `FAIL  SMOKE_REQUIRE_BASE_URL is set, but SMOKE_BASE_URL is not an absolute http(s) URL (got ${JSON.stringify(raw)}).`,
  );
  console.error("      Refusing to fall back to localhost for a production smoke test.");
  process.exit(1);
}
if (raw && !/^https?:\/\//.test(raw)) {
  console.error(`FAIL  SMOKE_BASE_URL must be an absolute http(s) URL (got ${JSON.stringify(raw)}).`);
  process.exit(1);
}

const BASE = (raw || "http://localhost:8080").replace(/\/$/, "");
console.log(`Smoke target: ${BASE}`);

const ROUTES = [
  { path: "/", expect: [200] },
  { path: "/auth", expect: [200, 307, 308] },
  { path: "/desk", expect: [200] },
  { path: "/dispatch", expect: [200] },
  { path: "/hq", expect: [200] },
  { path: "/system", expect: [200] },
  { path: "/import", expect: [200] },
  { path: "/playbook", expect: [200] },
  { path: "/reports", expect: [200] },
  { path: "/install", expect: [200] },
  { path: "/manifest.webmanifest", expect: [200] },
  { path: "/sw.js", expect: [200] },
  { path: "/icons/icon-192.png", expect: [200] },
  { path: "/icons/icon-512.png", expect: [200] },
];

const results = [];
let failed = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function checkRoute({ path, expect }) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    record(`route ${path}`, expect.includes(res.status), `status ${res.status}`);
  } catch (error) {
    record(`route ${path}`, false, String(error));
  }
}

async function checkVersionEndpoint() {
  try {
    const res = await fetch(`${BASE}/api/public/agent/version?version_code=0`);
    const body = await res.json();
    const ok = res.status === 200 && "latest" in body;
    record(
      "release metadata",
      ok,
      body.latest ? `latest v${body.latest.version_name}` : "no release published",
    );
  } catch (error) {
    record("release metadata", false, String(error));
  }
}

async function checkApk() {
  const url = `${BASE}/api/public/download/apk`;

  try {
    const head = await fetch(url, { method: "HEAD", redirect: "follow" });
    record("apk HEAD", head.ok, `status ${head.status}`);
  } catch (error) {
    record("apk HEAD", false, String(error));
  }

  try {
    // Real bytes: a 302 to a dead asset or an HTML error page fails here.
    const res = await fetch(url, { headers: { Range: "bytes=0-3" }, redirect: "follow" });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK" — APKs are zip files
    record(
      "apk GET signature",
      res.ok && isZip,
      `status ${res.status}, ${bytes.length} bytes read`,
    );
  } catch (error) {
    record("apk GET signature", false, String(error));
  }

  try {
    const res = await fetch(`${BASE}/api/public/download/apk-info`);
    const info = await res.json();
    const ok =
      res.ok && info.available && info.size > 1_000_000 && /^[a-f0-9]{64}$/.test(info.sha256);
    record(
      "apk checksum",
      ok,
      ok ? `${info.size} bytes, sha256 ${info.sha256.slice(0, 12)}…` : "unavailable",
    );
  } catch (error) {
    record("apk checksum", false, String(error));
  }
}

console.log(`Winstone Connect smoke test → ${BASE}\n`);
for (const route of ROUTES) await checkRoute(route);
await checkVersionEndpoint();
await checkApk();

console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
