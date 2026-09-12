import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/integrations/supabase/types";

/**
 * Sign-in for the Winstone Connect Android app.
 *
 * POST /api/public/agent/login  { email, password }
 * Header: x-ingest-secret
 *
 * Same credentials as the web CRM: the agent types the email + password of
 * their Winstone Connect account, the server verifies it with Auth and returns
 * the desk identity (employee id / agent id / name) the app posts afterwards.
 */
const Body = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(200),
});

function authorized(request: Request): boolean {
  const secret = process.env["INGEST_SECRET"];
  const provided = request.headers.get("x-ingest-secret") ?? "";
  if (!secret || provided.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) diff |= secret.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isNewKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export const Route = createFileRoute("/api/public/agent/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);

        const raw = await request.json().catch(() => null);
        const parsed = Body.safeParse(raw);
        if (!parsed.success) return json({ error: "ইমেইল ও পাসওয়ার্ড দিন" }, 400);

        const url = process.env["SUPABASE_URL"];
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!url || !key) return json({ error: "Auth not configured" }, 500);

        const auth = createClient<Database>(url, key, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              if (isNewKey(key) && headers.get("Authorization") === `Bearer ${key}`) {
                headers.delete("Authorization");
              }
              headers.set("apikey", key);
              return fetch(input, { ...init, headers });
            },
          },
        });

        const { data: session, error } = await auth.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (error || !session.user) {
          return json({ error: "ইমেইল বা পাসওয়ার্ড মিলছে না" }, 401);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id, name, employee_id, phone, role, is_active, approval_status")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (!profile) {
          return json({ error: "এই অ্যাকাউন্টের ডেস্ক প্রোফাইল তৈরি হয়নি — CRM এ একবার সাইন ইন করুন" }, 403);
        }
        if (profile.approval_status !== "approved" || !profile.is_active) {
          return json({ error: "অ্যাকাউন্ট এখনও অনুমোদনের অপেক্ষায় আছে" }, 403);
        }

        // The phone posts every call/WhatsApp log with an employee id, so make
        // sure an approved desk always has one.
        let employeeId = profile.employee_id;
        if (!employeeId) {
          employeeId = `WIN${String(Date.now()).slice(-6)}`;
          await supabaseAdmin.from("profiles").update({ employee_id: employeeId }).eq("id", profile.id);
        }

        return json({
          ok: true,
          agent: {
            id: profile.id,
            name: profile.name,
            employee_id: employeeId,
            phone: profile.phone,
            role: profile.role,
          },
        });
      },
    },
  },
});
