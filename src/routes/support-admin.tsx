import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BarChart3, BookOpen, Loader2, Settings, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/crm/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminToken } from "@/lib/local-session";
import {
  deleteCannedReply,
  deleteKbArticle,
  listCannedReplies,
  listKbArticles,
  loadSupportSettings,
  saveCannedReply,
  saveKbArticle,
  saveKbCategory,
  supportAnalytics,
  updateSupportSettings,
} from "@/lib/support-admin.functions";
import { ARTICLE_STATUSES, formatMinutes, type ArticleStatus } from "@/lib/support-shared";

export const Route = createFileRoute("/support-admin")({
  head: () => ({
    meta: [
      { title: "Support Admin — Knowledge Base, AI & SLA Settings" },
      {
        name: "description",
        content:
          "Publish help articles, manage saved replies, tune the AI assistant's confidence threshold and SLA targets, and review support performance.",
      },
      { property: "og:title", content: "Support Admin — Knowledge Base, AI & SLA Settings" },
      {
        property: "og:description",
        content: "Everything that shapes how the support assistant answers customers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <AppShell>
      <p className="text-sm text-destructive">Support admin could not be loaded.</p>
    </AppShell>
  ),
  notFoundComponent: () => (
    <AppShell>
      <p className="text-sm text-muted-foreground">Not found.</p>
    </AppShell>
  ),
  component: SupportAdminPage,
});

type Tab = "analytics" | "kb" | "replies" | "settings";

const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
  { id: "analytics", label: "Performance", icon: BarChart3 },
  { id: "kb", label: "Knowledge base", icon: BookOpen },
  { id: "replies", label: "Saved replies", icon: Sparkles },
  { id: "settings", label: "AI & SLA", icon: Settings },
];

function SupportAdminPage() {
  const [tab, setTab] = useState<Tab>("analytics");

  return (
    <AppShell>
      <h1 className="text-lg font-bold tracking-tight">Support admin</h1>
      <p className="text-xs text-muted-foreground">
        Knowledge base, saved replies, assistant behaviour and performance.
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5 rounded-full border border-border bg-surface-2/60 p-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === item.id ? "bg-card text-primary shadow-sm" : "text-muted-foreground"
            }`}
          >
            <item.icon className="size-3.5" />
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "kb" && <KnowledgeTab />}
        {tab === "replies" && <RepliesTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function AnalyticsTab() {
  const adminToken = useAdminToken();
  const [days, setDays] = useState(30);
  const analytics = useQuery({
    queryKey: ["support", "analytics", days, adminToken],
    queryFn: () => supportAnalytics({ data: { adminToken, days } }),
  });

  if (analytics.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </p>
    );
  }
  if (analytics.isError) {
    return (
      <p className="text-sm text-destructive">
        {analytics.error instanceof Error ? analytics.error.message : "Unavailable"}
      </p>
    );
  }

  const data = analytics.data!;
  const totals = data.totals;
  const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[7, 30, 90].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={days === value ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setDays(value)}
          >
            Last {value} days
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Conversations" value={String(totals.conversations)} />
        <Stat label="Resolved" value={String(totals.resolved)} />
        <Stat label="Handled without a human" value={percent(totals.deflectionRate)} />
        <Stat label="Escalated" value={String(totals.escalated)} />
        <Stat label="Tickets" value={`${totals.tickets} (${totals.aiCreatedTickets} by AI)`} />
        <Stat label="First response" value={formatMinutes(totals.avgFirstResponseMinutes)} />
        <Stat label="Resolution time" value={formatMinutes(totals.avgResolutionMinutes)} />
        <Stat
          label="CSAT"
          value={
            totals.csatAverage === null
              ? "No ratings yet"
              : `${totals.csatAverage.toFixed(1)}/5 (${totals.csatResponses})`
          }
        />
      </div>

      {totals.slaBreaches > 0 && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {totals.slaBreaches} conversation(s) passed the first-response target without a human reply.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">By topic</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {data.byCategory.length === 0 && <li className="text-muted-foreground">No data yet.</li>}
            {data.byCategory.map((row) => (
              <li key={row.category} className="flex items-center justify-between gap-2">
                <span className="capitalize">{row.category.replace(/-/g, " ")}</span>
                <span className="text-muted-foreground">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">By agent</p>
          <ul className="mt-2 space-y-1.5 text-xs">
            {data.byAgent.length === 0 && (
              <li className="text-muted-foreground">Nothing assigned yet.</li>
            )}
            {data.byAgent.map((row) => (
              <li key={row.name} className="flex items-center justify-between gap-2">
                <span>{row.name}</span>
                <span className="text-muted-foreground">
                  {row.resolved}/{row.assigned} resolved
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function KnowledgeTab() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const kb = useQuery({
    queryKey: ["support", "kb", "admin", adminToken],
    queryFn: () => listKbArticles({ data: { adminToken } }),
  });

  const empty = {
    id: undefined as string | undefined,
    title: "",
    summary: "",
    bodyMarkdown: "",
    status: "draft" as ArticleStatus,
    categoryId: "" as string,
  };
  const [form, setForm] = useState(empty);
  const [categoryName, setCategoryName] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["support", "kb"] });
  };

  const save = useMutation({
    mutationFn: () =>
      saveKbArticle({
        data: {
          adminToken,
          ...(form.id ? { id: form.id } : {}),
          title: form.title.trim(),
          summary: form.summary.trim() || undefined,
          bodyMarkdown: form.bodyMarkdown.trim(),
          status: form.status,
          categoryId: form.categoryId || null,
          tags: [],
        },
      }),
    onSuccess: () => {
      toast.success("Article saved");
      setForm(empty);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => deleteKbArticle({ data: { adminToken, id } }),
    onSuccess: () => {
      toast.success("Article archived");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addCategory = useMutation({
    mutationFn: () => saveKbCategory({ data: { adminToken, name: categoryName.trim() } }),
    onSuccess: () => {
      setCategoryName("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (kb.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </p>
    );
  }
  if (kb.isError) {
    return (
      <p className="text-sm text-destructive">
        {kb.error instanceof Error ? kb.error.message : "Unavailable"}
      </p>
    );
  }

  const data = kb.data!;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-3">
        <p className="text-sm font-semibold">Articles ({data.articles.length})</p>
        <p className="text-[11px] text-muted-foreground">
          The assistant answers only from published articles — every published article widens what it
          can safely say.
        </p>
        <ul className="space-y-2">
          {data.articles.map((article) => (
            <li key={article.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{article.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {article.status} · {article.view_count} views
                  </p>
                </div>
                {data.canEdit && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() =>
                        setForm({
                          id: article.id,
                          title: article.title,
                          summary: article.summary ?? "",
                          bodyMarkdown: article.body_markdown,
                          status: article.status as ArticleStatus,
                          categoryId: article.category_id ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Archive ${article.title}`}
                      onClick={() => archive.mutate(article.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
          {data.articles.length === 0 && (
            <li className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
              No articles yet. Add your first one to give the assistant something to answer from.
            </li>
          )}
        </ul>

        {data.canEdit && (
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-semibold">Categories</p>
            <div className="mt-2 flex gap-2">
              <Input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="New category name"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={categoryName.trim().length < 2 || addCategory.isPending}
                onClick={() => addCategory.mutate()}
              >
                Add
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {data.categories.map((category) => category.name).join(" · ") || "None yet"}
            </p>
          </div>
        )}
      </div>

      {data.canEdit ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">{form.id ? "Edit article" : "New article"}</p>
          <div className="space-y-1">
            <Label htmlFor="kb-title" className="text-xs">
              Title
            </Label>
            <Input
              id="kb-title"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="kb-summary" className="text-xs">
              Summary
            </Label>
            <Input
              id="kb-summary"
              value={form.summary}
              onChange={(event) => setForm({ ...form, summary: event.target.value })}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="kb-status" className="text-xs">
                Status
              </Label>
              <select
                id="kb-status"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as ArticleStatus })
                }
              >
                {ARTICLE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="kb-category" className="text-xs">
                Category
              </Label>
              <select
                id="kb-category"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={form.categoryId}
                onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              >
                <option value="">Uncategorised</option>
                {data.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="kb-body" className="text-xs">
              Body (markdown)
            </Label>
            <Textarea
              id="kb-body"
              rows={12}
              value={form.bodyMarkdown}
              onChange={(event) => setForm({ ...form, bodyMarkdown: event.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={save.isPending || form.title.trim().length < 3 || form.bodyMarkdown.trim().length < 10}
              onClick={() => save.mutate()}
            >
              {save.isPending && <Loader2 className="mr-1 size-3.5 animate-spin" />}
              Save article
            </Button>
            {form.id && (
              <Button size="sm" variant="ghost" onClick={() => setForm(empty)}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
          You can read the knowledge base here. Publishing needs a support lead account.
        </p>
      )}
    </div>
  );
}

function RepliesTab() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const replies = useQuery({
    queryKey: ["support", "canned", adminToken],
    queryFn: () => listCannedReplies({ data: { adminToken } }),
  });
  const [form, setForm] = useState({ shortcut: "/", title: "", body: "" });

  const save = useMutation({
    mutationFn: () =>
      saveCannedReply({
        data: {
          adminToken,
          shortcut: form.shortcut.trim(),
          title: form.title.trim(),
          body: form.body.trim(),
        },
      }),
    onSuccess: () => {
      setForm({ shortcut: "/", title: "", body: "" });
      toast.success("Saved reply added");
      void queryClient.invalidateQueries({ queryKey: ["support", "canned"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCannedReply({ data: { adminToken, id } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["support", "canned"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ul className="space-y-2">
        {(replies.data ?? []).map((reply) => (
          <li key={reply.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-primary">{reply.shortcut}</span>
              <span className="text-sm font-medium">{reply.title}</span>
              <Button
                size="icon"
                variant="ghost"
                className="ml-auto size-7"
                aria-label={`Delete ${reply.shortcut}`}
                onClick={() => remove.mutate(reply.id)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{reply.body}</p>
          </li>
        ))}
        {(replies.data ?? []).length === 0 && !replies.isLoading && (
          <li className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
            No saved replies yet.
          </li>
        )}
      </ul>

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">New saved reply</p>
        <Input
          value={form.shortcut}
          onChange={(event) => setForm({ ...form, shortcut: event.target.value })}
          placeholder="/refund"
          aria-label="Shortcut"
        />
        <Input
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
          placeholder="Refund policy"
          aria-label="Title"
        />
        <Textarea
          rows={5}
          value={form.body}
          onChange={(event) => setForm({ ...form, body: event.target.value })}
          placeholder="Reply text agents can insert"
          aria-label="Body"
        />
        <Button
          size="sm"
          disabled={save.isPending || form.title.trim().length < 2 || form.body.trim().length < 2}
          onClick={() => save.mutate()}
        >
          Save reply
        </Button>
      </div>
    </div>
  );
}

function SettingsTab() {
  const adminToken = useAdminToken();
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["support", "settings", adminToken],
    queryFn: () => loadSupportSettings({ data: { adminToken } }),
  });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof updateSupportSettings>[0] extends never ? never : Record<string, unknown>) =>
      updateSupportSettings({ data: { adminToken, ...patch } as never }),
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["support", "settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isLoading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </p>
    );
  }
  if (settings.isError) {
    return (
      <p className="text-sm text-destructive">
        {settings.error instanceof Error ? settings.error.message : "Unavailable"}
      </p>
    );
  }

  const { settings: current, canEdit } = settings.data!;

  return (
    <div className="max-w-xl space-y-3">
      {!canEdit && (
        <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          These settings are read-only for your session. A support admin can change them.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">AI assistant</p>
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={current.ai_enabled}
            disabled={!canEdit || update.isPending}
            onChange={(event) => update.mutate({ ai_enabled: event.target.checked })}
          />
          Let the assistant answer new conversations
        </label>
        <label className="mt-3 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={current.auto_escalate_on_low_confidence}
            disabled={!canEdit || update.isPending}
            onChange={(event) =>
              update.mutate({ auto_escalate_on_low_confidence: event.target.checked })
            }
          />
          Hand over to a person when confidence is below the threshold
        </label>
        <div className="mt-3 space-y-1">
          <Label htmlFor="threshold" className="text-xs">
            Confidence threshold ({Math.round(current.ai_confidence_threshold * 100)}%)
          </Label>
          <input
            id="threshold"
            type="range"
            min={20}
            max={95}
            step={5}
            className="w-full"
            defaultValue={Math.round(current.ai_confidence_threshold * 100)}
            disabled={!canEdit || update.isPending}
            onMouseUp={(event) =>
              update.mutate({
                ai_confidence_threshold: Number((event.target as HTMLInputElement).value) / 100,
              })
            }
          />
        </div>
        <div className="mt-3 space-y-1">
          <Label htmlFor="persona" className="text-xs">
            Assistant name shown to customers
          </Label>
          <Input
            id="persona"
            defaultValue={current.ai_persona}
            disabled={!canEdit || update.isPending}
            onBlur={(event) => {
              if (event.target.value.trim() !== current.ai_persona) {
                update.mutate({ ai_persona: event.target.value.trim() });
              }
            }}
          />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Service targets</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="sla-first" className="text-xs">
              First response (minutes)
            </Label>
            <Input
              id="sla-first"
              type="number"
              min={5}
              defaultValue={current.sla_first_response_minutes}
              disabled={!canEdit || update.isPending}
              onBlur={(event) =>
                update.mutate({ sla_first_response_minutes: Number(event.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sla-resolve" className="text-xs">
              Resolution (minutes)
            </Label>
            <Input
              id="sla-resolve"
              type="number"
              min={30}
              defaultValue={current.sla_resolution_minutes}
              disabled={!canEdit || update.isPending}
              onBlur={(event) =>
                update.mutate({ sla_resolution_minutes: Number(event.target.value) })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
