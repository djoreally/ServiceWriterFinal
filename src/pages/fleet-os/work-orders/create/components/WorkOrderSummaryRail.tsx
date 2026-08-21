import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Send, XCircle } from "lucide-react";
import { computeEstimate, type WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  onCreate: () => void;
  submitting: boolean;
  promotable: boolean;
}

const Row = ({ label, value, ok }: { label: string; value: string; ok?: boolean }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-xs text-right font-medium ${ok === false ? "text-muted-foreground" : ""}`}>
      {value}
    </span>
  </div>
);

export const WorkOrderSummaryRail = ({ state, onCreate, submitting, promotable }: Props) => {
  const est = computeEstimate(state);
  const vehicleCount = state.vehicles.length;

  return (
    <div className="sticky top-4 space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
            Work Order Review
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <div className="pb-1">
            <Row label="Customer" value={state.customer?.name ?? "—"} ok={!!state.customer} />
            <Row label="Location" value={state.location?.name ?? "—"} ok={!!state.location} />
            <Row
              label="Vehicles"
              value={vehicleCount > 0 ? `${vehicleCount} selected` : "—"}
              ok={vehicleCount > 0}
            />
            <Row
              label="Service"
              value={state.servicePackage?.label ?? "—"}
              ok={!!state.servicePackage}
            />
            <Row
              label="Contract"
              value={
                state.contract
                  ? `${state.contract.name ?? "Contract"}${state.contract.revision != null ? ` · v${state.contract.revision}` : ""}`
                  : state.customer ? "None" : "—"
              }
              ok={!!state.contract}
            />
            {state.contract && (state.contract.start_date || state.contract.end_date) && (
              <Row
                label="Effective"
                value={`${state.contract.start_date ?? "?"} → ${state.contract.end_date ?? "ongoing"}`}
              />
            )}
            <Row
              label="Schedule"
              value={
                state.scheduledDate && state.scheduledTime
                  ? `${state.scheduledDate} · ${state.scheduledTime}`
                  : "—"
              }
              ok={!!(state.scheduledDate && state.scheduledTime)}
            />
            <Row
              label="Technician"
              value={state.assignLater ? "Assign later" : state.technicianId ? "Assigned" : "Unassigned"}
              ok={state.assignLater || !!state.technicianId}
            />
            <Row label="PO" value={state.poNumber || (state.contract?.po_required ? "Required" : "—")} />
            <Row label="Billing" value={state.billingMethod} />
          </div>

          <div className="pt-3 pb-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {vehicleCount} × ${state.servicePackage?.base_price_per_vehicle ?? 0}
              </span>
              <span>${est.subtotal.toFixed(2)}</span>
            </div>
            {state.addOns.length > 0 && (
              <div className="flex items-center justify-between text-xs mt-1">
                <span className="text-muted-foreground">Add-ons</span>
                <span>
                  ${state.addOns.reduce((s, a) => s + a.price, 0).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between mt-2 pt-2 border-t">
              <span className="text-sm font-semibold">Estimated Revenue</span>
              <span className="text-lg font-bold">${est.total.toFixed(2)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">
            Validation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {state.validation.map((v) => {
            const Icon = v.passed
              ? CheckCircle2
              : v.blocking
                ? XCircle
                : AlertTriangle;
            const color = v.passed
              ? "text-emerald-500"
              : v.blocking
                ? "text-red-500"
                : "text-amber-500";
            return (
              <div key={v.key} className="flex items-start gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${color}`} />
                <span className={v.passed ? "text-muted-foreground" : ""}>{v.message}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Button
        onClick={onCreate}
        disabled={!promotable || submitting}
        className="w-full bg-blue-600 hover:bg-blue-700"
        size="lg"
      >
        <Send className="h-4 w-4 mr-2" />
        {submitting ? "Creating…" : "Create Work Order"}
      </Button>
    </div>
  );
};
