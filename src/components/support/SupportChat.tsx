import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bot, Loader2, Paperclip, Send, ShieldCheck, Sparkles, User, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { MarkdownView } from "@/components/crm/MarkdownView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getSupportAttachmentUrl,
  getSupportThread,
  requestHumanSupport,
  sendSupportMessage,
  startSupportConversation,
  submitSupportCsat,
  uploadSupportAttachment,
} from "@/lib/support.functions";
import type { SupportMessage } from "@/lib/support-shared";

const TOKEN_KEY = "winstone.support.token";

function readToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode */
  }
}

type Pending = { name: string; size: number; type: string; path: string };

/** Author styling for the three voices in a support thread. */
function bubbleClass(kind: SupportMessage["author_kind"]) {
  if (kind === "customer") return "ml-auto bg-primary text-primary-foreground";
  if (kind === "system") return "mx-auto bg-muted text-muted-foreground text-xs";
  return "mr-auto bg-card border border-border";
}

function AuthorIcon({ kind }: { kind: SupportMessage["author_kind"] }) {
  if (kind === "customer") return <User className="size-3.5" />;
  if (kind === "ai") return <Sparkles className="size-3.5 text-primary" />;
  if (kind === "agent") return <UserRound className="size-3.5 text-primary" />;
  return <ShieldCheck className="size-3.5" />;
}

export function SupportChat() {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => setToken(readToken()), []);

  const thread = useQuery({
    queryKey: ["support", "thread", token],
    queryFn: () => getSupportThread({ data: { token: token! } }),
    enabled: Boolean(token),
    refetchInterval: 15000,
    retry: false,
  });

  useEffect(() => {
    if (thread.isError) {
      writeToken(null);
      setToken(null);
    }
  }, [thread.isError]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.data?.messages.length]);

  const start = useMutation({
    mutationFn: () =>
      startSupportConversation({
        data: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          message: draft.trim(),
          attachments,
        },
      }),
    onSuccess: (result) => {
      writeToken(result.token);
      setToken(result.token);
      setDraft("");
      setAttachments([]);
      queryClient.setQueryData(["support", "thread", result.token], result.thread);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: () =>
      sendSupportMessage({ data: { token: token!, body: draft.trim(), attachments } }),
    onSuccess: (updated) => {
      setDraft("");
      setAttachments([]);
      queryClient.setQueryData(["support", "thread", token], updated);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const human = useMutation({
    mutationFn: () => requestHumanSupport({ data: { token: token! } }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["support", "thread", token], updated);
      toast.success("A member of the support team will join this conversation.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const csat = useMutation({
    mutationFn: (value: number) => submitSupportCsat({ data: { token: token!, rating: value } }),
    onSuccess: () => {
      toast.success("Thanks for the feedback.");
      void thread.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const attach = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files).slice(0, 5 - attachments.length)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 5 MB`);
          continue;
        }
        const buffer = await file.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buffer);
        for (let index = 0; index < bytes.length; index += 1) {
          binary += String.fromCharCode(bytes[index]!);
        }
        const saved = await uploadSupportAttachment({
          data: { name: file.name, type: file.type, base64: btoa(binary) },
        });
        setAttachments((current) => [...current, saved]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const openAttachment = async (path: string) => {
    try {
      const { url } = await getSupportAttachmentUrl({ data: { path } });
      window.open(url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the file");
    }
  };

  const busy = start.isPending || send.isPending;
  const data = thread.data;
  const escalated = Boolean(data?.conversation.escalated_at);

  return (
    <div className="flex h-[min(76vh,720px)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-2/40">
      <header className="flex items-center gap-3 border-b border-border bg-card/80 px-4 py-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary/10">
          <Bot className="size-4 text-primary" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Support assistant</p>
          <p className="text-[11px] text-muted-foreground">
            {escalated
              ? data?.ticket
                ? `Handed to the team · ${data.ticket.ref}`
                : "Handed to the support team"
              : "Answers come from our published help articles only"}
          </p>
        </div>
        {token && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs"
            onClick={() => {
              writeToken(null);
              setToken(null);
            }}
          >
            New conversation
          </Button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!token && (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Hi — how can we help?</p>
            <p className="text-xs text-muted-foreground">
              Ask your question below. The assistant answers from our help centre, and hands you to a
              person whenever it cannot verify an answer.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="support-name" className="text-xs">
                  Your name (optional)
                </Label>
                <Input
                  id="support-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ayesha Rahman"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="support-email" className="text-xs">
                  Email (optional, for updates)
                </Label>
                <Input
                  id="support-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </div>
          </div>
        )}

        {thread.isLoading && token && (
          <p className="text-center text-xs text-muted-foreground">Loading your conversation…</p>
        )}

        {(data?.messages ?? []).map((message) => (
          <div key={message.id} className="space-y-1">
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${bubbleClass(message.author_kind)}`}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium opacity-80">
                <AuthorIcon kind={message.author_kind} />
                {message.author_label ??
                  (message.author_kind === "customer" ? "You" : message.author_kind)}
              </p>
              <div className="whitespace-pre-wrap break-words">{message.body}</div>
              {message.ai_citations.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1.5 border-t border-border/60 pt-2 text-[11px]">
                  <span className="text-muted-foreground">Sources:</span>
                  {message.ai_citations.map((citation) => (
                    <Link
                      key={citation.id}
                      to="/help/$slug"
                      params={{ slug: citation.slug }}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      {citation.title}
                    </Link>
                  ))}
                </p>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> The assistant is thinking…
          </p>
        )}

        {data?.conversation.status === "resolved" && !data.csat && (
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-sm font-medium">How did we do?</p>
            <div className="mt-2 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={rating === value ? "default" : "outline"}
                  onClick={() => {
                    setRating(value);
                    csat.mutate(value);
                  }}
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <footer className="border-t border-border bg-card/80 px-4 py-3">
        {attachments.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((file) => (
              <li
                key={file.path}
                className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px]"
              >
                <button type="button" onClick={() => void openAttachment(file.path)}>
                  {file.name}
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setAttachments((current) => current.filter((item) => item.path !== file.path))
                  }
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Describe your issue…"
            rows={2}
            className="min-h-[44px] resize-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (draft.trim().length > 1 && !busy) (token ? send : start).mutate();
              }
            }}
          />
          <label className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-md border border-border hover:bg-muted">
            <input
              type="file"
              className="sr-only"
              multiple
              onChange={(event) => void attach(event.target.files)}
            />
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            <span className="sr-only">Attach a file</span>
          </label>
          <Button
            size="icon"
            disabled={busy || draft.trim().length < 2}
            onClick={() => (token ? send : start).mutate()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="sr-only">Send</span>
          </Button>
        </div>
        {token && !escalated && (
          <button
            type="button"
            className="mt-2 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            onClick={() => human.mutate()}
            disabled={human.isPending}
          >
            Talk to a human instead
          </button>
        )}
      </footer>
    </div>
  );
}

/** Compact article preview used on the help centre landing page. */
export function ArticlePreview({ source }: { source: string }) {
  return <MarkdownView source={source} />;
}
