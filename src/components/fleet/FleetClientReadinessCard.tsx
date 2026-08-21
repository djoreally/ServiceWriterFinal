import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Upload } from "lucide-react";
import type { FleetClientReadiness } from "@/application/queries/fleet-client-detail.query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function FleetClientReadinessCard({ readiness, onOpenStep, onImport, onCreateJob }: {
  readiness: FleetClientReadiness;
  onOpenStep: (tab: FleetClientReadiness["blockers"][number]["tab"]) => void;
  onImport: () => void;
  onCreateJob: () => void;
}) {
  return <Card className={readiness.readyForAutomatedInvoices ? "border-emerald-500/30" : "border-amber-500/30"}>
    <CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">Client onboarding readiness</CardTitle><Badge className={readiness.readyForAutomatedInvoices ? "bg-emerald-600" : "bg-amber-600"}>{readiness.readyForAutomatedInvoices ? "Ready" : `${readiness.blockers.length} items remaining`}</Badge></div></CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">{readiness.readyForService ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}Ready to service vehicles</div>
        <div className="flex items-center gap-2 rounded-md border p-3 text-sm">{readiness.readyForAutomatedInvoices ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}Contract + PO ready for automated invoices</div>
      </div>
      {readiness.blockers.length > 0 && <div className="divide-y rounded-md border">{readiness.blockers.map((item) => <button key={item.key} type="button" onClick={() => onOpenStep(item.tab)} className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"><span>{item.label}</span><span className="text-xs text-primary">Resolve</span></button>)}</div>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={onImport}><Upload className="mr-1 h-4 w-4" />Import vehicles</Button><Button size="sm" onClick={onCreateJob} disabled={!readiness.readyForAutomatedInvoices}><ClipboardList className="mr-1 h-4 w-4" />Create site visit</Button></div>
    </CardContent>
  </Card>;
}
