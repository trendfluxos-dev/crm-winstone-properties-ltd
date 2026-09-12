import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FilePlus2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { RoleGate } from "@/components/crm/RoleGate";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAllDocs } from "@/lib/docs.functions";
import { useAdminToken } from "@/lib/local-session";

export const Route = createFileRoute("/docs-admin/")({
  head: () => ({
    meta: [
      { title: "ডকুমেন্টেশন ব্যবস্থাপনা — Winstone CRM" },
      {
        name: "description",
        content: "Winstone CRM-এর নির্দেশিকা পাতা তৈরি, সম্পাদনা ও প্রকাশ করার কনসোল।",
      },
      { property: "og:title", content: "ডকুমেন্টেশন ব্যবস্থাপনা — Winstone CRM" },
      {
        property: "og:description",
        content: "খসড়া থেকে প্রকাশ পর্যন্ত নির্দেশিকা পাতার নিয়ন্ত্রণ।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocsAdminPage,
});

const STATUS_LABEL: Record<string, string> = {
  draft: "DRAFT — খসড়া",
  in_review: "IN REVIEW — পর্যালোচনায়",
  published: "PUBLISHED — প্রকাশিত",
  archived: "ARCHIVED — সংরক্ষিত",
};

function DocsAdminPage() {
  return (
    <AppShell>
      <RoleGate
        allow={["authority", "coordinator"]}
        icon={<ShieldCheck className="size-7" />}
        title="ডকুমেন্টেশন ব্যবস্থাপনা"
        description="নির্দেশিকা লিখতে ও প্রকাশ করতে IT Console বা এইচকিউ অ্যাকাউন্ট লাগবে।"
      >
        <DocsAdmin />
      </RoleGate>
    </AppShell>
  );
}

function DocsAdmin() {
  const adminToken = useAdminToken();
  const fetchAll = useServerFn(listAllDocs);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<string>("all");

  const docs = useQuery({
    queryKey: ["docs", "all", adminToken ? "pin" : "session"],
    queryFn: () => fetchAll({ data: { adminToken } }),
  });

  const rows = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (docs.data ?? []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!q) return true;
      return `${row.title} ${row.slug} ${row.category}`.toLowerCase().includes(q);
    });
  }, [docs.data, term, status]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">ডকুমেন্টেশন ব্যবস্থাপনা</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            পাতা লিখুন, পর্যালোচনায় রাখুন, প্রকাশ করলে সাথে সাথে /docs-এ দেখা যাবে।
          </p>
        </div>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/docs-admin/editor/$slug" params={{ slug: "new" }}>
            <FilePlus2 className="size-4" /> নতুন পাতা
          </Link>
        </Button>
      </header>

      <div className="flex flex-wrap gap-2">
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="শিরোনাম বা slug খুঁজুন…"
          className="max-w-xs"
        />
        {["all", "draft", "in_review", "published", "archived"].map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "default" : "secondary"}
            onClick={() => setStatus(value)}
          >
            {value === "all" ? "সব" : (STATUS_LABEL[value] ?? value).split(" — ")[0]}
          </Button>
        ))}
      </div>

      {docs.isLoading ? (
        <p className="text-xs text-muted-foreground">আসছে…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          কোনো পাতা নেই। “নতুন পাতা” চেপে প্রথম নির্দেশিকা লিখুন।
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="card-elevated flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-semibold">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  /{row.slug} · {row.category} · হালনাগাদ{" "}
                  {new Date(row.updated_at).toLocaleString("bn-BD")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={row.status === "published" ? "default" : "secondary"}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </Badge>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/docs-admin/editor/$slug" params={{ slug: row.slug }}>
                    সম্পাদনা
                  </Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
