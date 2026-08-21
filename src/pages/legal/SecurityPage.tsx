import { MarketingSiteFooter, MarketingSiteHeader } from "@/components/layout/MarketingSiteChrome";

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingSiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-16 lg:py-20 space-y-8">
        <header className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Legal</p>
          <h1 className="text-4xl font-black">Security Overview</h1>
          <p className="text-muted-foreground">
            Effective Date: April 5, 2026. This page summarizes Service Writer security controls, operational safeguards, and reporting channels.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">1. Security Program</h2>
          <p className="text-muted-foreground">
            Service Writer maintains an ongoing security program that includes technical, administrative, and organizational controls
            designed to protect confidentiality, integrity, and availability of customer data.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">2. Core Controls</h2>
          <ul className="list-disc pl-6 text-muted-foreground space-y-2">
            <li>Role-based access control and least-privilege authorization models.</li>
            <li>Encrypted transport (TLS) and secure credential/token handling.</li>
            <li>Audit logging and event monitoring for critical access/change operations.</li>
            <li>Secure development practices with review and testing gates.</li>
            <li>Backups and recovery procedures for operational resilience.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">3. Incident Response</h2>
          <p className="text-muted-foreground">
            We maintain incident response procedures for detection, triage, containment, remediation, and post-incident review.
            Where legally required, affected customers are notified in accordance with applicable breach notification obligations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">4. Vulnerability Reporting</h2>
          <p className="text-muted-foreground">
            Report suspected vulnerabilities to{" "}
            <a className="text-primary underline" href="mailto:security@servicewriter.xyz">security@servicewriter.xyz</a>.
            Please include reproduction details, impact assessment, and affected endpoints/features.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-bold">5. Compliance and Customer Responsibilities</h2>
          <p className="text-muted-foreground">
            Security is a shared responsibility. Customers are responsible for account security hygiene, including credential policies,
            access reviews, endpoint/device controls, and lawful handling of their end-customer data.
          </p>
        </section>

        <p className="text-xs text-muted-foreground">
          This security overview is informational only and not a contractual commitment unless incorporated in a signed agreement.
        </p>
      </main>
      <MarketingSiteFooter />
    </div>
  );
}
