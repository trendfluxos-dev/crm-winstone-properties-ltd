import { z } from "zod";

/**
 * The IT customizer: extra lead fields, floor rules and agent permissions.
 * Stored as one JSON record (public.app_config) and served to both the web CRM
 * and the Android client so every device follows the same live rules.
 */

export const CustomFieldSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_]+$/, "lowercase letters, numbers and underscore only"),
  label: z.string().trim().min(1).max(60),
  type: z.enum(["text", "number", "select", "date"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

export const RulesSchema = z.object({
  /** A call shorter than this does not count as connected. */
  minConnectedSeconds: z.number().int().min(1).max(600).default(30),
  /** Hours an agent has to call back a follow-up lead before it turns overdue. */
  followUpSlaHours: z.number().int().min(1).max(720).default(24),
  /** Dials each agent is expected to make per day. */
  dailyDialTarget: z.number().int().min(0).max(500).default(60),
  /** Attempts before a lead is parked as unreachable. */
  maxAttemptsBeforeDrop: z.number().int().min(1).max(30).default(5),
  /** Carrier rate used for billing estimates, BDT per minute. */
  ratePerMinute: z.number().min(0).max(100).default(0.4),
  /** New website/ad leads are auto-assigned to the lightest workload. */
  autoAssignNewLeads: z.boolean().default(true),
  /** Android client must upload the recording for every dial. */
  requireCallRecording: z.boolean().default(true),
  /** Android client must ask before recording a call. */
  askRecordingConsent: z.boolean().default(false),
});
export type Rules = z.infer<typeof RulesSchema>;

export const PermissionsSchema = z.object({
  agentCanEditLeadPhone: z.boolean().default(false),
  agentCanSeeOtherAgents: z.boolean().default(false),
  agentCanExportData: z.boolean().default(false),
  agentCanLogManualCall: z.boolean().default(true),
  agentCanReassignLead: z.boolean().default(false),
  agentCanUseAiCoach: z.boolean().default(true),
});
export type Permissions = z.infer<typeof PermissionsSchema>;

export const AppConfigSchema = z.object({
  fields: z.array(CustomFieldSchema).max(20).default([]),
  rules: RulesSchema.default({}),
  permissions: PermissionsSchema.default({}),
  /**
   * Email addresses allowed to reach the CRM through the agent-integration
   * (MCP) endpoint. Empty list = nobody, which is the safe default.
   */
  mcpAllowedEmails: z
    .array(z.string().trim().toLowerCase().email().max(160))
    .max(25)
    .default([]),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;

export const DEFAULT_CONFIG: AppConfig = AppConfigSchema.parse({});

/** Tolerant parse — an older/partial saved record still yields a full config. */
export function parseConfig(input: unknown): AppConfig {
  const result = AppConfigSchema.safeParse(input ?? {});
  return result.success ? result.data : DEFAULT_CONFIG;
}

export const FIELD_TYPE_LABELS: Record<CustomField["type"], string> = {
  text: "Text",
  number: "Number",
  select: "Dropdown",
  date: "Date",
};

export const PERMISSION_LABELS: { key: keyof Permissions; label: string; hint: string }[] = [
  {
    key: "agentCanSeeOtherAgents",
    label: "See other agents' leads",
    hint: "Off keeps every agent inside their own queue.",
  },
  {
    key: "agentCanEditLeadPhone",
    label: "Edit a lead's phone number",
    hint: "Off protects imported numbers from being changed.",
  },
  {
    key: "agentCanReassignLead",
    label: "Hand a lead to another agent",
    hint: "Off means only the coordinator can move leads.",
  },
  {
    key: "agentCanLogManualCall",
    label: "Log a call by hand",
    hint: "For calls made outside the app.",
  },
  {
    key: "agentCanExportData",
    label: "Export / download data",
    hint: "Off blocks CSV downloads on agent devices.",
  },
  {
    key: "agentCanUseAiCoach",
    label: "Use the AI Coach",
    hint: "Personal performance summary and next steps.",
  },
];
