import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Winstone Connect" },
      {
        name: "description",
        content:
          "Terms of Service for Winstone Connect: access conditions, acceptable use, data ownership and liability.",
      },
      { property: "og:title", content: "Terms of Service — Winstone Connect" },
      {
        property: "og:description",
        content:
          "Access conditions, acceptable use and data responsibilities for Winstone Connect users.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-10">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to Winstone Connect
        </Link>
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Effective date: 10 September 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-foreground">
          <section>
            <h2 className="text-lg font-semibold">1. Acceptance of terms</h2>
            <p className="mt-2 text-muted-foreground">
              By accessing or using Winstone Connect (the "Service"), you agree to be bound by these
              Terms of Service. If you do not agree, do not use the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">2. Description of service</h2>
            <p className="mt-2 text-muted-foreground">
              Winstone Connect is a tele-sales operations system that provides lead management,
              agent assignment, call/WhatsApp logging, audio transcription, AI coaching insights and
              billing summaries. The Service is provided on an "as is" and "as available" basis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">3. User accounts and roles</h2>
            <p className="mt-2 text-muted-foreground">
              Access is granted through role-based controls: Sales Agents, Team Coordinators and
              Executive Authorities. You are responsible for keeping your PIN and device secure. The
              master PIN and server tokens must not be shared outside authorised personnel.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">4. Acceptable use</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Use the Service only for lawful sales and customer-service purposes.</li>
              <li>Do not upload malicious files, spam or unrelated content.</li>
              <li>Obtain any legally required consent before recording calls.</li>
              <li>
                Do not attempt to bypass access controls or access data you are not authorised to
                view.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold">5. Data ownership and confidentiality</h2>
            <p className="mt-2 text-muted-foreground">
              You retain ownership of the customer and business data you enter. Winstone Connect
              processes and stores this data on your behalf. We will not use your data to train
              public models or disclose it to unauthorised third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">6. Billing and carrier costs</h2>
            <p className="mt-2 text-muted-foreground">
              Estimated carrier costs shown in the Service are calculated from connected call
              duration and an editable per-minute rate. These estimates are for internal planning
              only and do not replace actual invoices from your telecom provider.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">7. Limitation of liability</h2>
            <p className="mt-2 text-muted-foreground">
              To the fullest extent permitted by law, Winstone Connect and its developers are not
              liable for indirect, incidental or consequential damages arising from your use of the
              Service, including data loss, revenue loss or compliance penalties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">8. Changes to terms</h2>
            <p className="mt-2 text-muted-foreground">
              We may update these terms from time to time. Continued use of the Service after
              changes are posted constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">9. Governing law</h2>
            <p className="mt-2 text-muted-foreground">
              These terms are governed by the laws of Bangladesh. Any disputes shall be resolved in
              the courts of Dhaka, Bangladesh.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold">10. Contact</h2>
            <p className="mt-2 text-muted-foreground">
              For questions about these terms, contact{" "}
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
            This is a standard template terms of service. Please have it reviewed by legal counsel
            before publishing.
          </p>
        </div>
      </div>
    </div>
  );
}
