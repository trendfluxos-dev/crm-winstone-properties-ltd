import { getRequest } from "@tanstack/react-start/server";

/**
 * Safe request fingerprint for the audit trail: enough to recognise "same
 * device / same network", never enough to be a tracking profile. No cookies,
 * no tokens, no PIN material — the user agent is truncated and the IP is only
 * what the edge already puts in the forwarding headers.
 */
export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  platform: "web" | "android" | "unknown";
};

export function requestMeta(): RequestMeta {
  try {
    const headers = getRequest()?.headers;
    if (!headers) return { ip: null, userAgent: null, platform: "unknown" };

    const forwarded = headers.get("x-forwarded-for") ?? "";
    const ip = (headers.get("cf-connecting-ip") ?? forwarded.split(",")[0] ?? "").trim() || null;
    const rawAgent = headers.get("user-agent");
    const userAgent = rawAgent ? rawAgent.slice(0, 160) : null;
    const platform = !userAgent
      ? "unknown"
      : /okhttp|winstone-connect|android/i.test(userAgent)
        ? "android"
        : "web";

    return { ip, userAgent, platform };
  } catch {
    return { ip: null, userAgent: null, platform: "unknown" };
  }
}
