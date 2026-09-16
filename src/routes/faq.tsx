import { createFileRoute, Link } from "@tanstack/react-router";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "What is property data management?",
    a: "It is the practice of collecting, storing, cleaning and controlling access to everything you know about a property and the people connected to it — listings, units, owners, tenants, leads, calls, documents and transactions — so one trusted record exists instead of many conflicting copies.",
  },
  {
    q: "How do I keep property and tenant data secure?",
    a: "Store records in an encrypted database rather than spreadsheets or chat threads, give each person role-based access to only what their job needs, log who viewed or changed a record, and remove access the same day someone leaves. Keep sensitive files (ID documents, recordings, contracts) in private storage that is never publicly linkable.",
  },
  {
    q: "What data should a landlord or agency actually keep?",
    a: "Keep what you need to operate and prove compliance: property and unit details, lease terms, payment history, maintenance history, verified contact details, and a record of consent for marketing contact. Avoid collecting sensitive personal data you have no operational use for — every extra field is extra risk.",
  },
  {
    q: "How long should property records be retained?",
    a: "Follow the longest of the legal, tax or contractual requirement that applies to you — commonly the lease term plus several years. Set one written retention period per record type, then delete on schedule. An undefined retention policy usually means keeping everything forever, which is the costliest and riskiest option.",
  },
  {
    q: "How do I create a single source of truth for property data?",
    a: "Pick one system as the master for each data type (for example: the CRM owns leads and contacts, the accounting system owns payments). Everything else reads from it instead of keeping a private copy. Where two systems must both hold the data, sync one direction only, so there is never a question about which value wins.",
  },
  {
    q: "How do I migrate property data from spreadsheets to a CRM?",
    a: "Export a full copy first, standardise column names and formats (phone numbers, dates, currency), de-duplicate on a stable key such as phone or unit ID, import a small test batch, check the results by hand, then run the full import. Keep the original export untouched as a rollback point.",
  },
  {
    q: "How do I handle duplicate property or lead records?",
    a: "Choose one matching key per record type and enforce it at entry, so duplicates are blocked rather than cleaned up later. For existing data, merge into the oldest record, keep the most recently verified contact details, and preserve the full activity history from both sides of the merge.",
  },
  {
    q: "How do I keep property data accurate over time?",
    a: "Accuracy decays unless someone owns it. Assign a named owner per data set, timestamp every field that can go stale (contact number, asking price, availability), and run a short monthly review of records that have not been touched in 90 days. Make correcting a record easier than working around it.",
  },
  {
    q: "What property data should be reported on, and how often?",
    a: "Daily: new leads, calls made, follow-ups due. Weekly: pipeline by stage and agent, occupancy and vacancy. Monthly: conversion rate, source performance, revenue and outstanding payments. Report on numbers someone will act on — a metric with no owner and no decision attached is noise.",
  },
  {
    q: "Should property data live in a spreadsheet or a database?",
    a: "A spreadsheet is fine for a one-off list. Once more than one person edits it, or it drives daily decisions, move to a database-backed system: spreadsheets have no access control, no audit trail, no validation and no safe concurrent editing — which is exactly how conflicting versions appear.",
  },
  {
    q: "How do I give a team access without exposing everything?",
    a: "Define roles before users. An agent sees their own leads and calls; a coordinator sees the team queue; an executive sees aggregate performance; an administrator manages the system but does not need routine access to customer records. Enforce this in the system, not by policy alone.",
  },
  {
    q: "What does good property data governance look like in practice?",
    a: "Four short documents anyone can read: what data you hold and why, who owns each data set, who may access it, and how long you keep it. Review them twice a year. Governance fails when it is a long document nobody opens, not when it is a short one people follow.",
  },
];

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Property Data Management FAQ — Winstone Connect" },
      {
        name: "description",
        content:
          "Clear answers to the most common property data management questions: security, retention, migration, duplicates, single source of truth, access control and reporting.",
      },
      {
        property: "og:title",
        content: "Property Data Management FAQ — Winstone Connect",
      },
      {
        property: "og:description",
        content:
          "Practical answers on securing, migrating, de-duplicating and governing property, lead and tenant data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Winstone Connect
        </Link>

        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">
          Property data management: frequently asked questions
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Short, practical answers to the questions property teams ask most often about keeping
          listing, lead, tenant and call data accurate, secure and usable.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-7">
          {FAQ_ITEMS.map((item) => (
            <section key={item.q}>
              <h2 className="text-base font-semibold text-foreground">{item.q}</h2>
              <p className="mt-2 text-muted-foreground">{item.a}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-border bg-muted/40 p-5">
          <h2 className="text-base font-semibold">Managing this inside Winstone Connect</h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            Leads, calls, follow-ups and reports live in one role-controlled system, so agents,
            coordinators and executives each see exactly what their work requires.
          </p>
          <Link
            to="/"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open Winstone Connect
          </Link>
        </div>
      </div>
    </div>
  );
}
