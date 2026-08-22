import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16 lg:py-20 space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-black">Privacy Policy</h1>
          <p className="text-muted-foreground">
            Effective Date: April 5, 2026. This policy explains how Service Writer collects, uses, discloses, and protects personal data.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">1. Scope</h2>
          <p className="text-muted-foreground">
            This Privacy Policy applies to personal information processed through Service Writer websites, applications, and related services.
            It applies to customers, end users, leads, and business contacts who interact with the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">2. Information We Collect</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li>Account and identity data (name, email, phone, role, business details).</li>
            <li>Operational data (appointments, vehicles, service history, invoices, communications).</li>
            <li>Technical data (device information, logs, IP address, usage telemetry, security events).</li>
            <li>Payment and billing metadata from payment processors (we do not store full card numbers).</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">3. How We Use Information</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li>Provide and improve products and support.</li>
            <li>Authenticate users and secure accounts.</li>
            <li>Process transactions, invoices, and service communications.</li>
            <li>Comply with legal obligations and enforce contractual rights.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">4. Legal Bases and Regional Rights</h2>
          <p className="text-muted-foreground">
            Where applicable (including GDPR/UK GDPR), we process information under contractual necessity, legitimate interests,
            legal compliance, or consent. Depending on jurisdiction (including CCPA/CPRA), individuals may request access, correction,
            deletion, export, or objection to certain processing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">5. Sharing and Processors</h2>
          <p className="text-muted-foreground">
            We share information with service providers acting under contract (hosting, analytics, communications, payments, support),
            and with authorities where legally required. We do not sell personal information in exchange for monetary consideration.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">6. Data Retention</h2>
          <p className="text-muted-foreground">
            We retain personal information only as long as needed for service delivery, contractual obligations, legal compliance,
            and legitimate business purposes, then delete or de-identify it according to retention schedules.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">7. Contact</h2>
          <p className="text-muted-foreground">
            Privacy requests: <a className="text-primary underline" href="mailto:privacy@servicewriter.xyz">privacy@servicewriter.xyz</a>.
            Security issues: <a className="text-primary underline" href="mailto:security@servicewriter.xyz">security@servicewriter.xyz</a>.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          This policy is informational and does not constitute legal advice. Consult legal counsel to align with your jurisdiction.
        </p>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
