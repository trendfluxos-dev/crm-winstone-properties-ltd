import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Clock, ShieldCheck, Sparkles } from "lucide-react";

import { SupportChat } from "@/components/support/SupportChat";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Chat with Support — Winstone" },
      {
        name: "description",
        content:
          "Get instant answers from the Winstone support assistant, grounded in our published help articles, with a human agent one click away.",
      },
      { property: "og:title", content: "Chat with Support — Winstone" },
      {
        property: "og:description",
        content:
          "AI-assisted support that never guesses: unverified questions go straight to a human agent with a ticket.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <p className="p-8 text-sm text-destructive">Support chat could not be loaded.</p>
  ),
  notFoundComponent: () => <p className="p-8 text-sm text-muted-foreground">Not found.</p>,
  component: SupportPage,
});

const PROMISES = [
  {
    icon: Sparkles,
    title: "Grounded answers",
    body: "The assistant replies only from our published help articles and shows its sources.",
  },
  {
    icon: ShieldCheck,
    title: "A human when it matters",
    body: "If it cannot verify an answer, the conversation is handed to an agent with a ticket.",
  },
  {
    icon: Clock,
    title: "Tracked to resolution",
    body: "Your conversation stays on this device, so you can come back and follow the ticket.",
  },
];

function SupportPage() {
  return (
    <div className="grid-noise min-h-screen">
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">How can we help?</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a conversation below — no account needed.
            </p>
          </div>
          <Link
            to="/help"
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:border-primary/40"
          >
            <BookOpen className="size-3.5" /> Browse help centre
          </Link>
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <SupportChat />
          <aside className="space-y-3">
            {PROMISES.map((item) => (
              <div key={item.title} className="rounded-xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <item.icon className="size-4 text-primary" />
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </aside>
        </div>
      </main>
    </div>
  );
}
