/**
 * Agent SIM ↔ desk account binding.
 *
 * Every agent calls from their own SIM. When a SIM call syncs from the phone we
 * must be certain which desk it belongs to, otherwise a lead can silently land
 * on another agent. One SIM number belongs to exactly one profile
 * (`profiles.sim_number`, unique on the last 11 digits), so the SIM is a hard
 * identity check on top of the per-device token.
 */

export function simKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

type SimAgent = { id: string; name: string; employee_id: string | null; sim_number: string | null };

async function simRoster(): Promise<SimAgent[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, name, employee_id, sim_number")
    .not("sim_number", "is", null)
    .limit(500);
  return data ?? [];
}

/** Which desk owns this SIM number, if any. */
export async function resolveAgentBySim(sim: string | null | undefined): Promise<SimAgent | null> {
  const key = simKey(sim);
  if (!key) return null;
  const roster = await simRoster();
  return roster.find((row) => simKey(row.sim_number) === key) ?? null;
}

export type SimBindResult =
  | { status: "bound" | "already"; sim: string }
  | { status: "conflict"; sim: string; ownerName: string }
  | { status: "invalid"; sim: string | null };

/**
 * Binds a SIM to one desk. A SIM already held by another desk is refused —
 * the CRM never silently moves a number between agents.
 */
export async function bindAgentSim(input: {
  profileId: string;
  sim: string | null | undefined;
  deviceId?: string | null;
}): Promise<SimBindResult> {
  const key = simKey(input.sim);
  if (!key) return { status: "invalid", sim: input.sim ?? null };

  const { normalizePhone } = await import("@/lib/ingest-resolve.server");
  const sim = normalizePhone(String(input.sim));
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const owner = await resolveAgentBySim(sim);
  if (owner && owner.id !== input.profileId) {
    return { status: "conflict", sim, ownerName: owner.name };
  }

  const markDevice = async () => {
    if (!input.deviceId) return;
    await supabaseAdmin
      .from("agent_devices")
      .update({ phone_number: sim, sim_verified_at: new Date().toISOString() })
      .eq("id", input.deviceId);
  };

  if (owner) {
    await markDevice();
    return { status: "already", sim };
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ sim_number: sim, sim_bound_at: new Date().toISOString() })
    .eq("id", input.profileId);
  if (error) return { status: "conflict", sim, ownerName: "অন্য এজেন্ট" };

  await markDevice();

  const { logAudit } = await import("@/lib/audit.server");
  await logAudit({
    action: "agent_sim_bound",
    entityType: "profile",
    entityId: input.profileId,
    actorProfileId: input.profileId,
    metadata: { sim_number: sim, device_id: input.deviceId ?? null },
  });

  return { status: "bound", sim };
}

/**
 * Guard for phone sync: the SIM the phone reports must belong to the agent the
 * device token identifies. Returns a Bengali reason when it does not.
 */
export async function simMatchesAgent(input: {
  profileId: string;
  sim: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = simKey(input.sim);
  if (!key) return { ok: true };
  const owner = await resolveAgentBySim(input.sim);
  if (!owner) return { ok: true };
  if (owner.id === input.profileId) return { ok: true };
  return {
    ok: false,
    reason: `এই সিম নম্বরটি ${owner.name}-এর অ্যাকাউন্টে যুক্ত — নিজের সিম দিয়ে কল করুন`,
  };
}
