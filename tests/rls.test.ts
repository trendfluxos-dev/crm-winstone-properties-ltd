/**
 * Live RLS checks against the project database with the browser (publishable)
 * key only — exactly what a hostile client can do. Every one of these must be
 * refused or return nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

const anon = createClient(url!, key!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key!.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
        headers.delete("Authorization");
      }
      headers.set("apikey", key!);
      return fetch(input, { ...init, headers });
    },
  },
});

const blocked = (result: { data: unknown; error: unknown }) =>
  Boolean(result.error) || (Array.isArray(result.data) && result.data.length === 0);

describe.runIf(url && key)("RLS: an unauthenticated client cannot read production data", () => {
  it("cannot read PIN hashes", async () => {
    const result = await anon.from("profiles").select("pin_hash").limit(1);
    expect(result.error).toBeTruthy();
  });

  it("cannot list leads", async () => {
    expect(blocked(await anon.from("leads").select("id, phone_number").limit(1))).toBe(true);
  });

  it("cannot list call recordings", async () => {
    expect(blocked(await anon.from("call_recordings").select("id, storage_path").limit(1))).toBe(
      true,
    );
  });

  it("cannot list call reports", async () => {
    expect(blocked(await anon.from("call_reports").select("id, summary").limit(1))).toBe(true);
  });

  it("cannot list device tokens", async () => {
    expect(blocked(await anon.from("agent_devices").select("id, token_hash").limit(1))).toBe(true);
  });

  it("cannot read the audit trail", async () => {
    expect(blocked(await anon.from("audit_logs").select("id, action").limit(1))).toBe(true);
  });

  it("cannot read user roles", async () => {
    expect(blocked(await anon.from("user_roles").select("user_id, role").limit(1))).toBe(true);
  });

  it("cannot read system settings", async () => {
    expect(blocked(await anon.from("system_settings").select("key, value").limit(1))).toBe(true);
  });

  it("cannot read the AI usage ledger", async () => {
    expect(blocked(await anon.from("ai_usage_events").select("id, est_credits").limit(1))).toBe(
      true,
    );
  });
});

describe.runIf(url && key)("RLS: an unauthenticated client cannot write production data", () => {
  it("cannot insert a lead", async () => {
    const result = await anon
      .from("leads")
      .insert({ name: "rls-probe", phone_number: "01700000000" })
      .select("id");
    expect(result.error).toBeTruthy();
  });

  it("cannot grant itself a role", async () => {
    const result = await anon
      .from("user_roles")
      .insert({ user_id: "00000000-0000-4000-8000-000000000000", role: "admin" })
      .select("id");
    expect(result.error).toBeTruthy();
  });

  it("cannot approve a profile", async () => {
    const result = await anon
      .from("profiles")
      .update({ approval_status: "approved" })
      .neq("id", "");
    expect(result.error).toBeTruthy();
  });

  it("cannot register a device", async () => {
    const result = await anon
      .from("agent_devices")
      .insert({
        profile_id: "00000000-0000-4000-8000-000000000000",
        token_hash: "x".repeat(64),
        platform: "android",
      })
      .select("id");
    expect(result.error).toBeTruthy();
  });

  it("cannot forge an audit log entry", async () => {
    const result = await anon
      .from("audit_logs")
      .insert({ action: "rls_probe", entity_type: "test" })
      .select("id");
    expect(result.error).toBeTruthy();
  });

  it("cannot write the AI usage ledger", async () => {
    const result = await anon
      .from("ai_usage_events")
      .insert({ category: "probe", units: 1, est_credits: 1 })
      .select("id");
    expect(result.error).toBeTruthy();
  });
});

describe.runIf(url && key)("private storage", () => {
  it("does not allow anonymous listing of call audio", async () => {
    const result = await anon.storage.from("call-audio").list();
    expect(Boolean(result.error) || (result.data ?? []).length === 0).toBe(true);
  });
});
