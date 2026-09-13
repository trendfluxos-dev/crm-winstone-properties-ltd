import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Winstone Connect" },
      {
        name: "description",
        content:
          "Winstone Connect privacy policy: how lead, call and WhatsApp data is collected, used, stored and protected.",
      },
      { property: "og:title", content: "Privacy Policy — Winstone Connect" },
      {
        property: "og:description",
        content: "How Winstone Connect handles tele-sales data, recordings and user information.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Winstone Connect
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: 10 September 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Information we collect</h2>
            <p className="mt-2 text-muted-foreground">
              Winstone Connect collects lead contact details (name, phone number, company, notes),
              call recordings, WhatsApp interaction logs, and agent activity timestamps. All data is
              entered by authorised users or ingested automatically from connected agent devices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. How we use your data</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Manage and assign sales leads across the tele-sales floor.</li>
              <li>Record, transcribe and analyse cellular calls for quality assurance.</li>
              <li>Generate performance dashboards, billing summaries and AI coaching insights.</li>
              <li>Maintain an audit trail of customer communications.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. Storage and security</h2>
            <p className="mt-2 text-muted-foreground">
              Data is stored in encrypted cloud databases and private object storage. Access is
              controlled through role-based permissions and server-verified PIN tokens. Call
              recordings are kept in a private bucket and are only accessible to authorised agents
              and executives.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Data sharing</h2>
            <p className="mt-2 text-muted-foreground">
              We do not sell or share lead, agent or call data with third parties. AI transcription
              and analysis is processed through the platform's managed AI gateway; raw recordings
              are not exposed publicly.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Retention and deletion</h2>
            <p className="mt-2 text-muted-foreground">
              Call recordings and interaction logs are retained for as long as the account requires
              them for compliance and coaching. Administrators may request deletion of records at
              any time; deletion will permanently remove the record and any associated private audio
              file.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Your rights</h2>
            <p className="mt-2 text-muted-foreground">
              Depending on your jurisdiction, you may have the right to access, correct, export or
              delete personal data. Please contact the system administrator or the data controller
              listed below to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For privacy-related questions, contact the Winstone Connect administrator at{" "}
              <a
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="mailto:support@winstonebd.com"
              >
                support@winstonebd.com
              </a>
              .
            </p>
          </section>

          <p className="pt-6 text-xs italic text-muted-foreground">
            This is a standard template privacy policy. Please have it reviewed by legal counsel
            before publishing.
          </p>
        </div>
      </div>
    </div>
  );
}
