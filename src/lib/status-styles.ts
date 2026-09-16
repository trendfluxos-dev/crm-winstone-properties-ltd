/**
 * One status language for the whole product — web today, the Android screens
 * when they are represented here. Colour carries meaning, never decoration:
 * green = done/synced, amber = pending/warm, red = urgent/hot/failed,
 * grey = inactive/cold, gold = brand emphasis, blue = system information.
 *
 * Presentation only: these are class strings built from existing design
 * tokens. No data, rules or contracts live here.
 */

const BADGE = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold";

/** Lead temperature — HOT red, WARM amber, COLD neutral grey. */
export const TEMPERATURE_STYLES: Record<string, string> = {
  hot: "border-critical/35 bg-critical/10 text-critical",
  warm: "border-warning/35 bg-warning/10 text-warning",
  cold: "border-border bg-surface-2 text-muted-foreground",
};

/** Lead pipeline status. */
export const LEAD_STATUS_STYLES: Record<string, string> = {
  pending: "border-warning/35 bg-warning/10 text-warning",
  contacted: "border-success/35 bg-success/10 text-success",
  follow_up: "border-primary/40 bg-accent text-accent-foreground",
  closed: "border-border bg-surface-2 text-muted-foreground",
};

/** Device / queue sync states shared with the Android reference. */
export const SYNC_STYLES = {
  synced: "text-success",
  syncing: "text-warning",
  offline: "text-muted-foreground",
  error: "text-critical",
} as const;

export function badgeClass(tone: string | undefined, table: Record<string, string>) {
  return `${BADGE} ${table[tone ?? ""] ?? "border-border bg-surface-2 text-muted-foreground"}`;
}
