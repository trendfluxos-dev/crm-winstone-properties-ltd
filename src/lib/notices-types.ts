/** Client-safe shapes for the Bengali system notice bar. */

export type NoticeLevel = "critical" | "warning" | "info";

export type SystemNotice = {
  id: string;
  level: NoticeLevel;
  title: string;
  detail: string;
  action: string | null;
};
