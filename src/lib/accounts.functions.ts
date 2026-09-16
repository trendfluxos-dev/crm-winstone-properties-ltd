import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RequestedRole = z.enum(["agent", "coordinator"]);

/** Digits only, compared on the last 10 so 01805049668 / +8801805049668 match. */
function phoneKey(value: string): string | null {
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Agents sign in with a phone number or Employee ID instead of an email.
 * Resolves whatever they typed to the email of their desk account.
 */
export const resolveSignInEmail = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ identifier: z.string().trim().min(3).max(160) }).parse(input),
  )
  .handler(async ({ data }) => {
    const raw = data.identifier.trim();
    if (raw.includes("@")) return { email: raw };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("profiles")
      .select("email, phone, employee_id")
      .not("email", "is", null)
      .limit(500);

    const wantId = raw.toUpperCase().replace(/\s+/g, "");
    const wantPhone = phoneKey(raw);
    const match = (rows ?? []).find(
      (row) =>
        (row.employee_id ?? "").toUpperCase().replace(/\s+/g, "") === wantId ||
        (wantPhone !== null && row.phone !== null && phoneKey(row.phone) === wantPhone),
    );
    if (!match?.email) throw new Error("এই ফোন নম্বর বা Employee ID পাওয়া যায়নি");
    return { email: match.email };
  });

/**
 * Called right after sign-up / first sign-in. Everybody — roster staff
 * included — lands in "pending" and waits for the IT Console to approve the
 * account. The roster only pre-fills the role the approval will grant.
 * Idempotent.
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
    const rostered = rosterRole(data.name);

    if (rostered) {
      // Link this sign-up to the desk profile waiting for this person, but keep
      // it pending until the IT Console approves.
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
            role: rostered,
            requested_role: rostered,
            approval_status: "pending",
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
      role: rostered ?? "agent",
      requested_role: rostered ?? (data.requestedRole === "coordinator" ? "team_leader" : "agent"),
      approval_status: "pending",
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

/**
 * Required identity confirmation for a signed-in coordinator. This never
 * authenticates anybody: the bearer token already proves who the caller is, and
 * the row is matched on that user id only. It simply completes the existing
 * profile with the details the floor needs (name, Employee ID, phone) and
 * refuses an Employee ID that already belongs to another account.
 */
export const confirmMyIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        employeeId: z.string().trim().min(2).max(40),
        phone: z.string().trim().min(6).max(24),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const employeeId = data.employeeId.toUpperCase();
    const { data: clash } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (clash && clash.user_id !== context.userId) {
      throw new Error("এই কর্মী আইডি অন্য একটি অ্যাকাউন্টে ব্যবহার হচ্ছে");
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, employee_id: employeeId, phone: data.phone })
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Coordinator Deck entry confirmation.
 *
 * The caller has already been authenticated by the server as a dispatcher; this
 * records that they confirmed their own identity and opened the deck, with safe
 * request metadata only. No credential of any kind is written.
 */
export const confirmCoordinatorEntry = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireDispatch } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireDispatch(caller);

    const { logAudit } = await import("@/lib/audit.server");
    const { requestMeta } = await import("@/lib/request-meta.server");
    await logAudit({
      action: "coordinator_deck_opened",
      entityType: "console",
      entityId: "coordinator_deck",
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.employee_id ?? "authority",
      metadata: {
        surface: "coordinator_deck",
        status: "success",
        accessLevel: caller.leadModerator ? "lead_moderator" : caller.scope,
        ...requestMeta(),
        at: new Date().toISOString(),
      },
    });
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
    {
      const decider = await resolveCaller(data.adminToken);
      requireAuthority(decider);
      const { requireWrite } = await import("@/lib/access.server");
      requireWrite(decider);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch =
      data.decision === "reject"
        ? { approval_status: "rejected", is_active: false }
        : {
            approval_status: "approved",
            is_active: true,
            role:
              data.decision === "approve_coordinator"
                ? ("team_leader" as const)
                : ("agent" as const),
          };

    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.profileId);
    if (error) throw new Error(error.message);

    if (data.decision !== "reject") {
      const { refreshAgentDriveFolder } = await import("@/lib/drive-agent-folders.server");
      await refreshAgentDriveFolder(data.profileId);
    }

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: data.decision === "reject" ? "account_rejected" : "account_approved",
      entityType: "profile",
      entityId: data.profileId,
      metadata: { decision: data.decision, role: "role" in patch ? patch.role : null },
    });
    if ("role" in patch) {
      await logAudit({
        action: "role_changed",
        entityType: "profile",
        entityId: data.profileId,
        metadata: { role: patch.role },
      });
    }
    return { ok: true };
  });

const StaffRole = z.enum(["agent", "coordinator"]);

function fallbackEmail(employeeId: string | null, phone: string | null) {
  const local = (employeeId || phone || "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  if (!local) return null;
  return `${local}@winstonebd.com`;
}

/** Staff roster for the IT Console table: name, Agent ID, phone, live status. */
export const listStaffAccounts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().nullable().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    requireAuthority(await resolveCaller(data.adminToken ?? null));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [staffRes, leadsRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, user_id, name, email, phone, employee_id, role, is_active, approval_status, created_at",
        )
        .order("employee_id", { ascending: true }),
      supabaseAdmin.from("leads").select("assigned_to"),
    ]);
    if (staffRes.error) throw new Error(staffRes.error.message);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const assigned = new Map<string, number>();
    for (const lead of leadsRes.data ?? []) {
      if (lead.assigned_to)
        assigned.set(lead.assigned_to, (assigned.get(lead.assigned_to) ?? 0) + 1);
    }
    return {
      staff: (staffRes.data ?? []).map((row) => ({
        ...row,
        assignedLeads: assigned.get(row.id) ?? 0,
      })),
    };
  });

/**
 * Opens a live desk account straight from the IT Console: creates the sign-in
 * user, then an approved active profile. The agent signs in with the phone
 * number or Agent ID plus this password.
 */
export const createStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string().nullable().optional(),
        name: z.string().trim().min(2).max(80),
        employeeId: z.string().trim().min(2).max(24),
        phone: z.string().trim().min(6).max(24),
        password: z.string().min(6).max(72),
        email: z.string().trim().email().optional().nullable(),
        role: StaffRole.default("agent"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);
    (await import("@/lib/access.server")).requireWrite(caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const employeeId = data.employeeId.toUpperCase().replace(/\s+/g, "");
    const email = data.email?.trim() || fallbackEmail(employeeId, data.phone);
    if (!email) throw new Error("ইমেইল বা Agent ID দরকার");

    const { data: clash } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (clash) throw new Error("এই Agent ID আগেই আছে");

    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, employee_id: employeeId },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "সাইন-ইন অ্যাকাউন্ট তৈরি হয়নি");
    }

    const role = data.role === "coordinator" ? ("team_leader" as const) : ("agent" as const);
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: created.data.user.id,
        name: data.name,
        phone: data.phone,
        email,
        employee_id: employeeId,
        role,
        requested_role: role,
        approval_status: "approved",
        is_active: true,
      })
      .select("id")
      .single();
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
      throw new Error(error.message);
    }

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "agent_account_created",
      entityType: "profile",
      entityId: profile.id,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Authority PIN",
      metadata: { employeeId, role },
    });

    const { refreshAgentDriveFolder } = await import("@/lib/drive-agent-folders.server");
    await refreshAgentDriveFolder(profile.id);

    return { ok: true, profileId: profile.id, email };
  });

/** Edit name / Agent ID / phone / password, or deactivate a desk account. */
export const updateStaffAccount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        adminToken: z.string().nullable().optional(),
        profileId: z.string().uuid(),
        name: z.string().trim().min(2).max(80).optional(),
        employeeId: z.string().trim().min(2).max(24).optional(),
        phone: z.string().trim().min(6).max(24).optional(),
        password: z.string().min(6).max(72).optional(),
        isActive: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { resolveCaller, requireAuthority } = await import("@/lib/access.server");
    const caller = await resolveCaller(data.adminToken ?? null);
    requireAuthority(caller);
    (await import("@/lib/access.server")).requireWrite(caller);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id")
      .eq("id", data.profileId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!profile) throw new Error("অ্যাকাউন্ট পাওয়া যায়নি");

    const patch: {
      name?: string;
      employee_id?: string;
      phone?: string;
      is_active?: boolean;
    } = {};
    if (data.name) patch["name"] = data.name;
    if (data.employeeId) patch["employee_id"] = data.employeeId.toUpperCase().replace(/\s+/g, "");
    if (data.phone) patch["phone"] = data.phone;
    if (typeof data.isActive === "boolean") patch["is_active"] = data.isActive;

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", profile.id);
      if (!error && ("name" in patch || "employee_id" in patch)) {
        const { refreshAgentDriveFolder } = await import("@/lib/drive-agent-folders.server");
        await refreshAgentDriveFolder(profile.id);
      }
      if (error) throw new Error(error.message);
    }

    if (data.password) {
      if (!profile.user_id) throw new Error("এই প্রোফাইলে সাইন-ইন অ্যাকাউন্ট নেই");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(profile.user_id, {
        password: data.password,
      });
      if (error) throw new Error(error.message);
    }

    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      action: "agent_account_updated",
      entityType: "profile",
      entityId: profile.id,
      actorProfileId: caller.profile?.id ?? null,
      actorLabel: caller.profile?.name ?? "Authority PIN",
      metadata: {
        fields: Object.keys(patch),
        passwordChanged: Boolean(data.password),
      },
    });

    return { ok: true };
  });
