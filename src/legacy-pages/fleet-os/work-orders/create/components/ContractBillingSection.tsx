import { useEffect, useMemo } from "react";
import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileCheck2 } from "lucide-react";
import type { FleetWorkOrderCreateOptions } from "@/application/queries";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  options: FleetWorkOrderCreateOptions | null;
}

const BILLING_METHODS = [
  { value: "invoice", label: "Invoice" },
  { value: "credit_card", label: "Credit Card" },
  { value: "fleet_account", label: "Fleet Account" },
  { value: "cod", label: "COD" },
  { value: "contract", label: "Contract" },
];

export const ContractBillingSection = ({ state, dispatch, options }: Props) => {
  const contract = useMemo(() => {
    if (!options || !state.customer) return null;
    return options.contracts.find((c) => c.fleet_client_id === state.customer!.id && c.is_active) || null;
  }, [options, state.customer]);

  const poRequired = useMemo(() => {
    const rules = contract?.pricing_rules as Record<string, unknown> | null;
    if (!rules) return false;
    const po = rules.po as Record<string, unknown> | undefined;
    return Boolean(po?.requires_po || rules.requires_po || rules.po_required || rules.poRequired);
  }, [contract]);

  useEffect(() => {
    if (contract) {
      const rules = (contract.pricing_rules as Record<string, unknown> | null) ?? {};
      const versionMeta = rules.version_meta as Record<string, unknown> | undefined;
      const revision = versionMeta?.revision != null ? Number(versionMeta.revision) : null;
      dispatch({
        type: "SET_CONTRACT",
        contract: {
          id: contract.id,
          name: contract.name,
          sla_hours: contract.sla_hours,
          pricing_rules: contract.pricing_rules,
          po_required: poRequired,
          start_date: contract.start_date ?? null,
          end_date: contract.end_date ?? null,
          revision: Number.isFinite(revision as number) ? (revision as number) : null,
        },
      });
    } else {
      dispatch({ type: "SET_CONTRACT", contract: null });
    }
  }, [contract, poRequired, dispatch]);

  const validPOs = useMemo(() => {
    if (!state.customer || !options) return [];
    return options.purchaseOrders
      .filter((po) => {
        const remaining = Number(po.amount_limit || 0) - Number(po.amount_authorized || 0);
        return po.fleet_client_id === state.customer!.id
          && ["open", "partially_used"].includes(String(po.status || ""))
          && remaining > 0;
      });
  }, [options, state.customer]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileCheck2 className="h-4 w-4 text-rose-500" /> 6. Contract &amp; Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contract ? (
          <div className="rounded-md border bg-muted/20 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {contract.name || "Fleet Agreement"}
                {state.contract?.revision != null && (
                  <span className="ml-1.5 text-muted-foreground">v{state.contract.revision}</span>
                )}
              </span>
              <Badge variant={poRequired ? "destructive" : "secondary"}>
                {poRequired ? "PO required" : "PO optional"}
              </Badge>
            </div>
            {(contract.start_date || contract.end_date) && (
              <div className="text-muted-foreground">
                Effective {contract.start_date || "?"} → {contract.end_date || "ongoing"}
              </div>
            )}
            {contract.sla_hours != null && (
              <div className="text-muted-foreground">SLA: {contract.sla_hours}h response</div>
            )}
          </div>
        ) : state.customer ? (
          <p className="text-xs text-muted-foreground">No active contract on file.</p>
        ) : null}

        <div>
          <Label>Billing method</Label>
          <Select value={state.billingMethod} onValueChange={(v) => dispatch({ type: "SET_BILLING_METHOD", method: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {BILLING_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Purchase Order {poRequired ? "*" : "(optional)"}</Label>
          <Select value={state.poNumber} onValueChange={(v) => dispatch({ type: "SET_PO", poNumber: v })}>
            <SelectTrigger>
              <SelectValue placeholder={poRequired ? "PO required by contract" : "Attach PO if needed"} />
            </SelectTrigger>
            <SelectContent>
              {validPOs.map((po) => (
                <SelectItem key={po.id} value={String(po.po_number)}>
                  {po.po_number} — ${(Number(po.amount_limit || 0) - Number(po.amount_authorized || 0)).toFixed(2)} left
                </SelectItem>
              ))}
              {validPOs.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">No open POs for this customer.</div>
              )}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
