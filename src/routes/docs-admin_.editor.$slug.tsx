import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Loader2, Save, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/crm/AppShell";
import { MarkdownView } from "@/components/crm/MarkdownView";
import { RoleGate } from "@/components/crm/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readDocForEdit, saveDoc } from "@/lib/docs.functions";
import { useAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/docs-admin_/editor/$slug")({
  head: () => ({
    meta: [
      { title: "পাতা সম্পাদনা — Winstone CRM ডকুমেন্টেশন" },
      {
        name: "description",
        content: "নির্দেশিকা পাতা লিখুন, প্রিভিউ দেখুন এবং প্রকাশ করুন।",
      },
      { property: "og:title", content: "পাতা সম্পাদনা — Winstone CRM ডকুমেন্টেশন" },
      { property: "og:description", content: "খসড়া লিখুন, প্রিভিউ দেখুন, প্রকাশ করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditorPage,
});

const STATUSES = [
  { value: "draft", label: "DRAFT" },
  { value: "in_review", label: "IN REVIEW" },
  { value: "published", label: "PUBLISHED" },
  { value: "archived", label: "ARCHIVED" },
] as const;

function EditorPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority", "coordinator"]}
        icon={<ShieldCheck className="size-7" />}
        title="পাতা সম্পাদনা"
        description="নির্দেশিকা লিখতে IT Console বা এইচকিউ অ্যাকাউন্ট লাগবে।"
      >
        <Editor />
      </RoleGate>
    </AppShell>
  );
}

function Editor() {
  const { slug: routeSlug } = Route.useParams();
  const isNew = routeSlug === "new";
  const adminToken = useAdminToken();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const read = useServerFn(readDocForEdit);
  const save = useServerFn(saveDoc);

  const [slug, setSlug] = useState(isNew ? "" : routeSlug);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("সাধারণ");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [sortOrder, setSortOrder] = useState(0);
  const [preview, setPreview] = useState(false);

  const existing = useQuery({
    queryKey: ["docs", "edit", routeSlug, adminToken ? "pin" : "session"],
    queryFn: () => read({ data: { adminToken, slug: routeSlug } }),
    enabled: !isNew,
  });

  useEffect(() => {
    const page = existing.data;
    if (!page) return;
    setSlug(page.slug);
    setTitle(page.title);
    setCategory(page.category);
    setSummary(page.summary ?? "");
    setBody(page.body_markdown);
    setStatus(page.status);
    setSortOrder(page.sort_order);
  }, [existing.data]);

  const persist = useMutation({
    mutationFn: (nextStatus: string) =>
      save({
        data: {
          adminToken,
          slug,
          title,
          category,
          summary: summary || null,
          bodyMarkdown: body,
          status: nextStatus as "draft" | "in_review" | "published" | "archived",
          sortOrder,
        },
      }),
    onSuccess: (saved) => {
      setStatus(saved.status);
      toast.success(saved.status === "published" ? "প্রকাশ করা হয়েছে" : "সংরক্ষণ হয়েছে");
      void queryClient.invalidateQueries({ queryKey: ["docs"] });
      if (isNew) void navigate({ to: "/docs-admin/editor/$slug", params: { slug: saved.slug } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {isNew ? "নতুন পাতা" : title || routeSlug}
          </h1>
          <p className="text-xs text-muted-foreground">
            <Link to="/docs-admin" className="hover:underline">
              ডকুমেন্টেশন ব্যবস্থাপনা
            </Link>{" "}
            / সম্পাদনা
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setPreview((v) => !v)}>
            <Eye className="size-4" /> {preview ? "সম্পাদনা" : "প্রিভিউ"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={persist.isPending}
            onClick={() => persist.mutate(status === "published" ? "published" : "draft")}
          >
            {persist.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            সংরক্ষণ
          </Button>
          <Button size="sm" disabled={persist.isPending} onClick={() => persist.mutate("published")}>
            প্রকাশ করুন
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="শিরোনাম">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Slug (ইংরেজি ছোট হাতের, ড্যাশ)">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="agent-desk-guide" />
        </Field>
        <Field label="ক্যাটাগরি">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
        <Field label="ক্রম (ছোট আগে)">
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
          />
        </Field>
        <Field label="সারসংক্ষেপ" className="sm:col-span-2">
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={status === option.value ? "default" : "secondary"}
            onClick={() => setStatus(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {preview ? (
        <div className="card-elevated p-4">
          <MarkdownView source={body} />
        </div>
      ) : (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"# শিরোনাম\n\nএখানে নির্দেশিকা লিখুন…"}
          className="min-h-[420px] font-mono text-xs"
        />
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
