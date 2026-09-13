import type { Caller } from "@/lib/access.server";

/** Support staff = any approved account (agent, lead, admin) or a PIN session. */
export function requireSupportStaff(caller: Caller) {
  if (caller.scope === "none") throw new Error("Support access required — please sign in");
  return caller;
}

export function requireSupportWrite(caller: Caller) {
  requireSupportStaff(caller);
  if (caller.readOnly) throw new Error("This session is view-only");
  return caller;
}

/** Support lead / admin: knowledge base, canned replies, analytics. */
export function requireSupportLead(caller: Caller) {
  if (caller.scope !== "authority" && caller.scope !== "coordinator") {
    throw new Error("Support lead access required");
  }
  return caller;
}

export function requireSupportAdmin(caller: Caller) {
  if (caller.scope !== "authority") throw new Error("Support admin access required");
  return caller;
}

export function actorLabel(caller: Caller) {
  return caller.profile?.name ?? (caller.scope === "authority" ? "Support admin" : "Support agent");
}
