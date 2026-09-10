import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { AppConfigSchema, DEFAULT_CONFIG, parseConfig } from "@/lib/crm-config";

/** Live rules for every device. Contains no personal data, so it needs no PIN. */
export const getAppConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("data, updated_at")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    config: parseConfig(data?.data ?? {}),
    updatedAt: data?.updated_at ?? null,
  };
});

/** Saves the IT customizer. Master or IT console PIN required. */
export const saveAppConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ adminToken: z.string().min(1), config: AppConfigSchema }).parse(input),
  )
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert({ id: "default", data: data.config, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true as const, config: data.config };
  });

/** Restores the shipped defaults. */
export const resetAppConfig = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ adminToken: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { requireAdminToken } = await import("@/lib/admin-gate.server");
    requireAdminToken(data.adminToken);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_config")
      .upsert({ id: "default", data: DEFAULT_CONFIG, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true as const, config: DEFAULT_CONFIG };
  });
