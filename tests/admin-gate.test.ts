import { beforeAll, describe, expect, it } from "vitest";

let gate: typeof import("@/lib/admin-gate.server");
let deviceAuth: typeof import("@/lib/device-auth.server");

beforeAll(async () => {
  process.env["ADMIN_PIN"] = "test-master-pin";
  process.env["IT_CONSOLE_PIN"] = "test-it-pin";
  process.env["ADMIN_TOKEN_SECRET"] = "test-secret";
  gate = await import("@/lib/admin-gate.server");
  deviceAuth = await import("@/lib/device-auth.server");
});

describe("PIN unlock and admin token scopes", () => {
  it("accepts either configured PIN and rejects anything else", () => {
    expect(gate.pinMatches("test-master-pin")).toBe(true);
    expect(gate.pinMatches("test-it-pin")).toBe(true);
    expect(gate.pinMatches("test-master-pi")).toBe(false);
    expect(gate.pinMatches("")).toBe(false);
  });

  it("mints distinct tokens for the HQ (read-only) and IT (full) surfaces", () => {
    const full = gate.mintAdminToken("full");
    const hq = gate.mintAdminToken("hq");
    expect(full).not.toBe(hq);
    expect(gate.adminTokenScope(full)).toBe("full");
    expect(gate.adminTokenScope(hq)).toBe("hq");
  });

  it("rejects forged or empty tokens", () => {
    expect(gate.adminTokenScope("deadbeef")).toBeNull();
    expect(gate.adminTokenScope(null)).toBeNull();
    expect(gate.adminTokenValid("")).toBe(false);
  });

  it("refuses an HQ token where a full IT token is required", () => {
    expect(() => gate.requireAdminToken(gate.mintAdminToken("hq"))).toThrow();
    expect(() => gate.requireAdminToken(gate.mintAdminToken("full"))).not.toThrow();
  });
});

describe("device token issuing primitives", () => {
  it("generates 64 hex chars of randomness, never repeating", () => {
    const a = deviceAuth.newDeviceToken();
    const b = deviceAuth.newDeviceToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it("hashes deterministically so only the hash needs storing", async () => {
    const token = deviceAuth.newDeviceToken();
    expect(await deviceAuth.hashToken(token)).toBe(await deviceAuth.hashToken(token));
    expect(await deviceAuth.hashToken(token)).not.toBe(token);
  });
});
