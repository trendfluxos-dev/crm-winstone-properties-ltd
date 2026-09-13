import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, MessageCircle } from "lucide-react";

import { MarkdownView } from "@/components/crm/MarkdownView";
import { getPublishedArticle } from "@/lib/support.functions";

export const Route = createFileRoute("/help_/$slug")({
  head: () => ({
    meta: [
      { title: "Support article — Winstone Help Centre" },
      {
        name: "description",
        content:
          "A step-by-step Winstone support article. Read the guide, or chat with the support assistant if you still need help.",
      },
      { property: "og:title", content: "Support article — Winstone Help Centre" },
      {
        property: "og:description",
        content: "Verified answers from the Winstone support knowledge base.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <p className="p-8 text-sm text-destructive">This article could not be loaded.</p>
  ),
  notFoundComponent: () => (
    <p className="p-8 text-sm text-muted-foreground">This article does not exist.</p>
  ),
  component: ArticlePage,
});

function ArticlePage() {
  const { slug } = Route.useParams();
  const article = useQuery({
    queryKey: ["support", "kb", "article", slug],
    queryFn: () => getPublishedArticle({ data: { slug } }),
  });

  return (
    <div className="grid-noise min-h-screen">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <Link
          to="/help"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" /> All articles
        </Link>

        {article.isLoading && <p className="mt-8 text-sm text-muted-foreground">Loading…</p>}

        {!article.isLoading && !article.data && (
          <p className="mt-8 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            This article is not published.
          </p>
        )}

        {article.data && (
          <article className="mt-5">
            <h1 className="text-2xl font-bold tracking-tight">{article.data.title}</h1>
            {article.data.summary && (
              <p className="mt-2 text-sm text-muted-foreground">{article.data.summary}</p>
            )}
            <div className="mt-6 text-sm leading-relaxed">
              <MarkdownView source={article.data.body_markdown} />
            </div>
          </article>
        )}

        <div className="mt-10 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Still stuck?</p>
          <Link
            to="/support"
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-2 hover:underline"
          >
            <MessageCircle className="size-4" /> Chat with support
          </Link>
        </div>
      </main>
    </div>
  );
}
