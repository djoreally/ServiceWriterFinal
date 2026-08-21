import { Link } from "react-router-dom";
import { ArrowRight, FileText, Scale, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Tax reporting is intentionally withheld until it is backed by governed source
 * data, jurisdiction-specific rules, and a reviewed reporting/export workflow.
 * The page must never present examples, filing dates, or compliance statuses as
 * business facts.
 */
export default function TaxCompliance() {
  return (
    <AppLayout title="Tax & Compliance">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 md:p-8" aria-labelledby="tax-compliance-title">
        <section className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Tax &amp; compliance</p>
          <h1 id="tax-compliance-title" className="text-3xl font-black tracking-tight">Tax reporting is not available in this workspace</h1>
          <p className="max-w-2xl text-muted-foreground">
            This page does not currently calculate tax obligations, filing dates, deductions, registrations, or compliance status.
            To prevent misleading information, no sample records, exports, or reminders are shown.
          </p>
        </section>

        <Card className="border-primary/30">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <CardTitle>Review available financial records</CardTitle>
                <CardDescription className="mt-1">Use the existing financial and payment records for operational review. They are not a substitute for tax reporting or professional advice.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <Button asChild><Link to="/financials">Open financials <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
            <Button asChild variant="outline"><Link to="/payments">View payments <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Link></Button>
          </CardContent>
        </Card>

        <div className="flex gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground" role="status">
          <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>Tax treatment, filing requirements, deadlines, and regulatory compliance depend on jurisdiction and your business facts. Consult a qualified tax or legal professional before acting on financial records.</p>
        </div>

        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>A future reporting workflow should include reviewed calculations, source-data reconciliation, jurisdiction coverage, auditable exports, retention controls, and explicit user approval before any filing-related action.</p>
        </div>
      </main>
    </AppLayout>
  );
}
