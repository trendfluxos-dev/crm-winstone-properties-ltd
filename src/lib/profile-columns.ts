import type { Database } from "@/integrations/supabase/types";

/**
 * Profile columns that are safe to fetch in server functions whose result may
 * reach the browser. The pin_hash credential column is intentionally omitted.
 *
 * Kept as a single string literal so Supabase's select() generic can still
 * infer the narrow return type.
 */
export const PROFILE_SAFE_COLUMNS =
  "id,user_id,name,phone,email,employee_id,role,requested_role,approval_status,is_active,status,avatar_hue,presence,current_call_started_at,last_active_at,sim_number,sim_bound_at,created_at" as const;

/** Profile row shape without the sensitive pin_hash field. */
export type SafeProfile = Omit<Database["public"]["Tables"]["profiles"]["Row"], "pin_hash">;
