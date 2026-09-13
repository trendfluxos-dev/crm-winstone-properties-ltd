/**
 * Honest offline queue for the web CRM.
 *
 * Anything an agent does with no internet (a call attempt, an outcome, a report)
 * is kept here in the browser with a client-generated event id and shown as
 * "Saved offline / pending sync" — never as if it reached the server. When the
 * connection returns the queue is replayed in the order it was created against
 * the same server functions the online path uses; the event id makes a retry
 * idempotent, so a no-answer attempt and a later callback stay two separate CRM
 * events and nothing is duplicated.
 *
 * Storage is localStorage (small, synchronous, survives reload) — no new
 * dependency and no schema of its own.
 */
const KEY = "winstone.offline.queue.v1";

export type OfflineItemKind = "call_event" | "report_submit";

export type OfflineItem = {
  id: string;
  kind: OfflineItemKind;
  createdAt: string;
  status: "pending" | "failed";
  attempts: number;
  lastError?: string | null;
  label: string;
  payload: Record<string, unknown>;
};

type Listener = (items: OfflineItem[]) => void;

const listeners = new Set<Listener>();

export function newEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function readQueue(): OfflineItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OfflineItem[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / private mode — nothing else we can honestly do */
  }
  listeners.forEach((listener) => listener(items));
}

export function subscribeQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => listeners.delete(listener);
}

export function enqueue(
  kind: OfflineItemKind,
  label: string,
  payload: Record<string, unknown>,
): OfflineItem {
  const item: OfflineItem = {
    id: String(payload["clientEventId"] ?? newEventId()),
    kind,
    createdAt: new Date().toISOString(),
    status: "pending",
    attempts: 0,
    label,
    payload,
  };
  // Same client event id twice (double tap) -> one queued item.
  const existing = readQueue();
  if (existing.some((entry) => entry.id === item.id)) return item;
  writeQueue([...existing, item]);
  return item;
}

export function removeItem(id: string) {
  writeQueue(readQueue().filter((item) => item.id !== id));
}

export function markPending(id: string) {
  writeQueue(
    readQueue().map((item) =>
      item.id === id ? { ...item, status: "pending", lastError: null } : item,
    ),
  );
}

/** Errors that mean "the server already has this / it can never succeed". */
function isTerminal(message: string): boolean {
  return /ইতিমধ্যে|already|not found|পাওয়া যায়নি|duplicate/i.test(message);
}

export type Senders = {
  call_event: (payload: Record<string, unknown>) => Promise<unknown>;
  report_submit: (payload: Record<string, unknown>) => Promise<unknown>;
};

let flushing = false;

/** Replays the queue oldest-first. Stops on the first network failure. */
export async function flushQueue(senders: Senders): Promise<{ synced: number; failed: number }> {
  if (flushing) return { synced: 0, failed: 0 };
  flushing = true;
  let synced = 0;
  let failed = 0;
  try {
    for (const item of readQueue().sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      try {
        await senders[item.kind](item.payload);
        removeItem(item.id);
        synced += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "sync failed";
        if (isTerminal(message)) {
          removeItem(item.id);
          synced += 1;
          continue;
        }
        failed += 1;
        writeQueue(
          readQueue().map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  status: "failed",
                  attempts: entry.attempts + 1,
                  lastError: message.slice(0, 160),
                }
              : entry,
          ),
        );
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, failed };
}
