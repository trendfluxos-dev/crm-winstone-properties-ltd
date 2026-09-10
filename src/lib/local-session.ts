import { useSyncExternalStore } from "react";

/**
 * Tiny localStorage-backed stores for the admin unlock token and the
 * "Operating as" agent. No accounts, no sign-in — state lives on the device.
 */

export const ADMIN_TOKEN_KEY = "winstone.admin.token";
export const OPERATOR_KEY = "winstone.operator.id";

const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = () => fn();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* private mode — ignore */
  }
  emit();
}

function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
}

export function useAdminToken() {
  return useStoredValue(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null) {
  write(ADMIN_TOKEN_KEY, token);
}

export function getAdminToken() {
  return read(ADMIN_TOKEN_KEY);
}

export function useOperatorId() {
  return useStoredValue(OPERATOR_KEY);
}

export function setOperatorId(id: string | null) {
  write(OPERATOR_KEY, id);
}
