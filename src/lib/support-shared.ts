/** Shared support constants + types, safe for both browser and server code. */

export const CONVERSATION_STATUSES = ["open", "pending", "resolved"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const TICKET_STATUSES = ["open", "pending", "resolved", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CHANNELS = ["web", "email", "whatsapp", "phone"] as const;
export type Channel = (typeof CHANNELS)[number];

export const AUTHOR_KINDS = ["customer", "ai", "agent", "system"] as const;
export type AuthorKind = (typeof AUTHOR_KINDS)[number];

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const SUPPORT_CATEGORIES = [
  "getting-started",
  "billing",
  "technical",
  "account",
  "policies",
  "other",
] as const;

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
};

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  pending: "Pending",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export type SupportSettings = {
  ai_enabled: boolean;
  ai_confidence_threshold: number;
  ai_persona: string;
  auto_escalate_on_low_confidence: boolean;
  business_hours: { timezone: string; start: string; end: string; days: number[] };
  sla_first_response_minutes: number;
  sla_resolution_minutes: number;
  notify_on_escalation: boolean;
  email_channel_configured: boolean;
};

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  ai_enabled: true,
  ai_confidence_threshold: 0.55,
  ai_persona: "Winstone Support AI",
  auto_escalate_on_low_confidence: true,
  business_hours: { timezone: "Asia/Dhaka", start: "09:00", end: "18:00", days: [0, 1, 2, 3, 4] },
  sla_first_response_minutes: 60,
  sla_resolution_minutes: 1440,
  notify_on_escalation: true,
  email_channel_configured: false,
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  author_kind: AuthorKind;
  author_label: string | null;
  body: string;
  ai_model: string | null;
  ai_confidence: number | null;
  ai_citations: { id: string; slug: string; title: string }[];
  ai_needs_human: boolean | null;
  created_at: string;
};

export type CustomerThread = {
  conversation: {
    id: string;
    subject: string | null;
    status: ConversationStatus;
    escalated_at: string | null;
    ai_handled: boolean;
    created_at: string;
  };
  messages: SupportMessage[];
  ticket: { ref: string; status: TicketStatus; priority: Priority } | null;
  csat: { rating: number } | null;
};

/** Minutes until (positive) or past (negative) the SLA deadline. */
export function slaMinutesLeft(dueAt: string | null, now = Date.now()) {
  if (!dueAt) return null;
  return Math.round((new Date(dueAt).getTime() - now) / 60000);
}

export function formatMinutes(minutes: number | null) {
  if (minutes === null || Number.isNaN(minutes)) return "—";
  const abs = Math.abs(minutes);
  if (abs < 60) return `${abs}m`;
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.round((now - new Date(iso).getTime()) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
  return `${Math.floor(diff / 1440)}d ago`;
}
