import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/crm/AppShell";
import { Input } from "@/components/ui/input";
import { listPublishedDocs } from "@/lib/docs.functions";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Winstone CRM ডকুমেন্টেশন" },
      {
        name: "description",
        content: "Winstone Connect CRM ব্যবহারের নির্দেশিকা — এজেন্ট ডেস্ক, কল রিপোর্ট, ফলো-আপ ও এইচকিউ।",
      },
      { property: "og:title", content: "Winstone CRM ডকুমেন্টেশন" },
      {
        property: "og:description",
        content: "এজেন্ট, কোঅর্ডিনেটর ও এইচকিউ-এর জন্য ধাপে ধাপে নির্দেশিকা।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DocsIndexPage,
});

function DocsIndexPage() {
  const [term, setTerm] = useState("");
  const docs = useQuery({ queryKey: ["docs", "published"], queryFn: () => listPublishedDocs() });

  const grouped = useMemo(() => {
    const rows = (docs.data ?? []).filter((page) => {
      const q = term.trim().toLowerCase();
      if (!q) return true;
      return `${page.title} ${page.summary ?? ""} ${page.category}`.toLowerCase().includes(q);
    });
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()];
  }, [docs.data, term]);

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-5">
        <header className="space-y-1">
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
            <BookOpen className="size-5" /> ডকুমেন্টেশন
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            সিস্টেম ব্যবহারের নির্দেশিকা। প্রকাশিত পাতাগুলো সবাই পড়তে পারেন।
          </p>
        </header>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="খুঁজুন…"
            className="pl-9"
          />
        </div>

        {docs.isLoading ? (
          <p className="text-xs text-muted-foreground">আসছে…</p>
        ) : grouped.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            এখনো কোনো প্রকাশিত ডকুমেন্ট নেই। IT Console → ডকুমেন্টেশন থেকে প্রথম পাতাটি লিখুন।
          </p>
        ) : (
          grouped.map(([category, pages]) => (
            <section key={category} className="card-elevated space-y-2 p-4">
              <h2 className="text-sm font-bold tracking-tight">{category}</h2>
              <ul className="space-y-1.5">
                {pages.map((page) => (
                  <li key={page.slug}>
                    <Link
                      to="/docs/$slug"
                      params={{ slug: page.slug }}
                      className="block rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{page.title}</span>
                      {page.summary ? (
                        <span className="block text-xs text-muted-foreground">{page.summary}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </AppShell>
  );
}
