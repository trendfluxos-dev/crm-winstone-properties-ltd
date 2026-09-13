import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  Send,
  Sparkles,
  StickyNote,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAdminToken } from "@/lib/local-session";
import {
  addSupportNote,
  assistSupportConversation,
  escalateSupportConversation,
  getSupportConversation,
  sendSupportReply,
  updateSupportConversation,
} from "@/lib/support-staff.functions";
import {
  CONVERSATION_STATUSES,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  formatMinutes,
  relativeTime,
  slaMinutesLeft,
  type ConversationStatus,
  type Priority,
} from "@/lib/support-shared";

/**
 * Staff view of one conversation: transcript, AI assist, reply box, internal
 * notes and the routing controls. AI drafts always land in the reply box for a
 * human to read and edit — nothing is auto-sent.
 */
export function ConversationWorkspace({ conversationId }: { conversationId: string }) {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");

  const detail = useQuery({
    queryKey: ["support", "conversation", conversationId, adminToken],
    queryFn: () => getSupportConversation({ data: { adminToken, conversationId } }),
    refetchInterval: 20000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["support", "conversation", conversationId] });
    void queryClient.invalidateQueries({ queryKey: ["support", "inbox"] });
  };

  const send = useMutation({
    mutationFn: (resolve: boolean) =>
      sendSupportReply({ data: { adminToken, conversationId, body: reply.trim(), resolve } }),
    onSuccess: () => {
      setReply("");
      toast.success("Reply sent");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assist = useMutation({
    mutationFn: () => assistSupportConversation({ data: { adminToken, conversationId } }),
    onSuccess: (result) => {
      setReply(result.suggested_reply);
      toast.success("Draft ready — review before sending");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const update = useMutation({
    mutationFn: (patch: {
      status?: ConversationStatus;
      priority?: Priority;
      assigneeProfileId?: string | null;
    }) => updateSupportConversation({ data: { adminToken, conversationId, ...patch } }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const escalate = useMutation({
    mutationFn: () =>
      escalateSupportConversation({
        data: { adminToken, conversationId, reason: "Escalated by agent" },
      }),
    onSuccess: (result) => {
      toast.success(`Ticket ${result.ref} is open`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveNote = useMutation({
    mutationFn: () => addSupportNote({ data: { adminToken, conversationId, body: note.trim() } }),
    onSuccess: () => {
      setNote("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detail.isLoading) {
    return (
      <div className="grid h-full place-items-center text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }
  if (detail.isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        {detail.error instanceof Error ? detail.error.message : "Conversation unavailable"}
      </p>
    );
  }

  const data = detail.data!;
  const conversation = data.conversation;
  const readOnly = data.me.readOnly;
  const sla = slaMinutesLeft(conversation.sla_due_at);
  const breached = sla !== null && sla < 0 && !conversation.first_human_response_at;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border bg-card/70 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {conversation.subject ?? "Support conversation"}
          </p>
          {data.ticket && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {data.ticket.ref}
            </span>
          )}
          {breached && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <AlertTriangle className="size-3" /> SLA overdue {formatMinutes(sla)}
            </span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {data.customer?.name ?? "Unknown customer"}
          {data.customer?.email ? ` · ${data.customer.email}` : ""} · {conversation.channel} ·{" "}
          {conversation.ai_handled ? "AI is answering" : "Human handling"}
          {conversation.escalation_reason ? ` · ${conversation.escalation_reason}` : ""}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            aria-label="Conversation status"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={conversation.status}
            disabled={readOnly || update.isPending}
            onChange={(event) =>
              update.mutate({ status: event.target.value as ConversationStatus })
            }
          >
            {CONVERSATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <select
            aria-label="Priority"
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={conversation.priority}
            disabled={readOnly || update.isPending}
            onChange={(event) => update.mutate({ priority: event.target.value as Priority })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABEL[priority]}
              </option>
            ))}
          </select>
          {data.me.scope !== "agent" && (
            <select
              aria-label="Assignee"
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={conversation.assignee_profile_id ?? ""}
              disabled={readOnly || update.isPending}
              onChange={(event) =>
                update.mutate({ assigneeProfileId: event.target.value || null })
              }
            >
              <option value="">Unassigned</option>
              {(data.staffOptions ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
          {!data.ticket && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={readOnly || escalate.isPending}
              onClick={() => escalate.mutate()}
            >
              Create ticket
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            disabled={assist.isPending}
            onClick={() => assist.mutate()}
          >
            {assist.isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 size-3.5" />
            )}
            AI summary & draft
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {conversation.summary && (
          <div className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
              <Sparkles className="size-3.5" /> AI summary
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{conversation.summary}</p>
          </div>
        )}

        <ul className="space-y-3">
          {data.messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                message.author_kind === "customer"
                  ? "mr-auto border border-border bg-card"
                  : message.author_kind === "system"
                    ? "mx-auto bg-muted text-xs text-muted-foreground"
                    : "ml-auto bg-primary/10"
              }`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                {message.author_kind === "ai" ? (
                  <Bot className="size-3.5" />
                ) : (
                  <UserRound className="size-3.5" />
                )}
                {message.author_label ?? message.author_kind} · {relativeTime(message.created_at)}
                {message.ai_confidence !== null && (
                  <span>· confidence {(message.ai_confidence * 100).toFixed(0)}%</span>
                )}
              </p>
              <div className="whitespace-pre-wrap break-words">{message.body}</div>
              {message.ai_citations.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Sources: {message.ai_citations.map((citation) => citation.title).join(", ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>

      <footer className="border-t border-border bg-card/70 px-4 py-3">
        <Textarea
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          rows={3}
          placeholder={
            readOnly ? "This session is view-only" : "Write your reply, or use /shortcut for a saved reply"
          }
          disabled={readOnly}
          onChange0={undefined}
        />
        {data.cannedReplies.length > 0 && !readOnly && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.cannedReplies.map((canned) => (
              <button
                key={canned.id}
                type="button"
                className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-primary/40"
                onClick={() => setReply((current) => `${current}${current ? "\n\n" : ""}${canned.body}`)}
              >
                {canned.shortcut}
              </button>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={readOnly || send.isPending || reply.trim().length < 2}
            onClick={() => send.mutate(false)}
          >
            {send.isPending ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 size-3.5" />
            )}
            Send reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={readOnly || send.isPending || reply.trim().length < 2}
            onClick={() => send.mutate(true)}
          >
            <CheckCircle2 className="mr-1 size-3.5" /> Send &amp; resolve
          </Button>
        </div>

        <details className="mt-3">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <StickyNote className="size-3.5" /> Internal notes ({data.notes.length})
          </summary>
          <div className="mt-2 space-y-2">
            <div className="flex gap-2">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Note visible to staff only"
                disabled={readOnly}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly || saveNote.isPending || note.trim().length < 2}
                onClick={() => saveNote.mutate()}
              >
                Save
              </Button>
            </div>
            <ul className="space-y-1.5">
              {data.notes.map((item) => (
                <li key={item.id} className="rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
                  <span className="font-medium">{item.author_label ?? "Staff"}</span>{" "}
                  <span className="text-muted-foreground">{relativeTime(item.created_at)}</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </footer>
    </div>
  );
}
