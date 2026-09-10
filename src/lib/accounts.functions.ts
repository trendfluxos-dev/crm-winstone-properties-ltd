import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RequestedRole = z.enum(["agent", "coordinator"]);

/**
 * Called right after sign-up / first sign-in. Staff already on the pre-approved
 * roster are linked to their existing desk profile (or created as approved);
 * everyone else lands in "pending" for the IT Console to decide. Idempotent.
 */
export const registerMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().trim().max(24).optional().nullable(),
        requestedRole: RequestedRole,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { ok: true as const, created: false as const };

    const email = typeof context.claims["email"] === "string" ? context.claims["email"] : null;
    const { rosterRole, normalizeName } = await import("@/lib/roster.server");
    const preApproved = rosterRole(data.name);

    if (preApproved) {
      // Claim the roster profile that is waiting for this person, if there is one.
      const { data: unclaimed } = await supabaseAdmin
        .from("profiles")
        .select("id, name")
        .is("user_id", null)
        .limit(200);
      const match = (unclaimed ?? []).find(
        (row) => normalizeName(row.name) === normalizeName(data.name),
      );

      if (match) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            user_id: context.userId,
            email,
            phone: data.phone || null,
            role: preApproved,
            requested_role: preApproved,
            approval_status: "approved",
            is_active: true,
          })
          .eq("id", match.id);
        if (error) throw new Error(error.message);
        return { ok: true as const, created: false as const };
      }
    }

    const { error } = await supabaseAdmin.from("profiles").insert({
      user_id: context.userId,
      name: data.name,
      phone: data.phone || null,
      email,
      role: preApproved ?? "agent",
      requested_role:
        preApproved ?? (data.requestedRole === "coordinator" ? "team_leader" : "agent"),
      approval_status: preApproved ? "approved" : "pending",
      is_active: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const, created: true as const };
  });


/** Who am I? Drives the role-aware shell, nav and landing redirect. */
export const getMyAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { resolveCaller } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    return {
      scope: caller.scope,
      approval: caller.approval,
      signedIn: caller.userId !== null,
      profile: caller.profile
        ? {
            id: caller.profile.id,
            name: caller.profile.name,
            phone: caller.profile.phone,
            email: caller.profile.email,
            employee_id: caller.profile.employee_id,
            avatar_hue: caller.profile.avatar_hue,
            role: caller.profile.role,
            requested_role: caller.profile.requested_role,
          }
        : null,
    };
  });

/** Agents keep their own profile up to date (name, phone, avatar colour). */
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        phone: z.string().trim().max(24).optional().nullable(),
        avatarHue: z.number().int().min(0).max(360),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, phone: data.phone || null, avatar_hue: data.avatarHue })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Pending sign-ups, for the IT Console / HQ approval list. */
export const listAccountRequests = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: z.string() }).parse(input))
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, phone, requested_role, approval_status, created_at, role")
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { accounts: rows ?? [] };
  });

/** Approve as agent or coordinator, or reject. Master PIN only. */
export const decideAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string(),
        profileId: z.string().uuid(),
        decision: z.enum(["approve_agent", "approve_coordinator", "reject"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch =
      data.decision === "reject"
        ? { approval_status: "rejected", is_active: false }
        : {
            approval_status: "approved",
            is_active: true,
            role: data.decision === "approve_coordinator" ? ("team_leader" as const) : ("agent" as const),
          };

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.profileId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
