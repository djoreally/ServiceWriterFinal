import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16 lg:py-20 space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-black">Terms of Service</h1>
          <p className="text-muted-foreground">
            Effective Date: April 5, 2026. These terms govern your use of Service Writer services and related applications.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">1. Agreement and Eligibility</h2>
          <p className="text-muted-foreground">
            By accessing or using Service Writer, you agree to these Terms. You must be legally authorized to bind your organization
            and use the service in compliance with applicable laws.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">2. Service Use and Account Responsibilities</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li>You are responsible for account credentials, team permissions, and account activity.</li>
            <li>You agree not to misuse the service, reverse engineer restricted components, or violate security controls.</li>
            <li>You must maintain accurate business and customer records where required by law.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">3. Fees, Billing, and Payment</h2>
          <p className="text-muted-foreground">
            Paid subscriptions are billed under your selected plan and billing cadence. Fees are non-refundable except where required
            by law or expressly stated in a separate written agreement.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">4. Data, Intellectual Property, and License</h2>
          <p className="text-muted-foreground">
            You retain rights to your submitted business data. Service Writer grants a limited, non-exclusive, non-transferable license
            to use the platform during the subscription term. Platform code, branding, and documentation remain Service Writer property.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">5. Disclaimers and Limitation of Liability</h2>
          <p className="text-muted-foreground">
            The service is provided on an “as available” basis to the extent permitted by law. Except where prohibited, Service Writer
            is not liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits/revenue.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">6. Termination</h2>
          <p className="text-muted-foreground">
            You may stop using the service at any time. Service Writer may suspend or terminate access for breach, abuse, non-payment,
            legal requirements, or security risk.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">7. Governing Terms</h2>
          <p className="text-muted-foreground">
            Additional contractual terms (such as Data Processing Addendum, enterprise order forms, or Security Addendum) may apply.
            Where conflict exists, the signed order form governs for that customer relationship.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          These terms are a general template and do not constitute legal advice. Use counsel review before production legal publication.
        </p>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
