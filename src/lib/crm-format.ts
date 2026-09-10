export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return `${m}:${String(rest).padStart(2, "0")}`;
}

export function formatTalkTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export type TranscriptLine = { at: number; speaker: string; text: string };

export function parseTranscript(text: string | null): TranscriptLine[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/^\[(\d{1,2}):(\d{2})\]\s*([^:]+):\s*(.*)$/);
      if (!match) return null;
      const [, mm = "0", ss = "0", speaker = "", body = ""] = match;
      return {
        at: Number(mm) * 60 + Number(ss),
        speaker: speaker.trim(),
        text: body.trim(),
      };
    })
    .filter((l): l is TranscriptLine => l !== null);
}

export function summaryBullets(summary: string | null): string[] {
  if (!summary) return [];
  return summary
    .split("\n")
    .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
    .filter(Boolean);
}
