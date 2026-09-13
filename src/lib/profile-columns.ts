/**
 * Profile columns that are safe to fetch in server functions whose result may
 * reach the browser. The pin_hash credential column is intentionally omitted.
 */
export const PROFILE_SAFE_COLUMNS = [
  "id",
  "user_id",
  "name",
  "phone",
  "email",
  "employee_id",
  "role",
  "requested_role",
  "approval_status",
  "is_active",
  "status",
  "avatar_hue",
  "presence",
  "current_call_started_at",
  "last_active_at",
  "sim_number",
  "sim_bound_at",
  "created_at",
].join(",");
