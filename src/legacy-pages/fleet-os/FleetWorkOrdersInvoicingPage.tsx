/**
 * FleetWorkOrdersInvoicingPage — "Close work, then invoice it".
 *
 * Supports individual, mileage-confirmed completion and combining any
 * number of completed work orders — across multiple customers — into one
 * Stripe-payable invoice per customer and contract invoice group, with a preview step before the
 * invoices are actually created.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Eye, FileText, Loader2, Wrench } from "lucide-react";
import { FleetOSLayout } from "@/components/layout/FleetOSLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createInvoiceFromFleetWorkOrders } from "@/application/commands/invoices.command";
import { fetchInvoiceDetail, type InvoiceFullRow } from "@/application/queries/invoices.query";
import { fetchPaymentSettings } from "@/application/queries/payment-settings.query";
import { SendInvoiceDialog } from "@/components/invoices/SendInvoiceDialog";
import { CompleteFleetWorkOrderDialog } from "@/components/fleet/CompleteFleetWorkOrderDialog";
import { formatMoney } from "@/lib/financialMath";
import { calculateFleetInvoiceTotals } from "@/lib/fleetInvoiceTotals";
import { evaluateFleetInvoiceCompliance } from "@/application/presenters/fleet-invoice-compliance";
import { toast } from "sonner";
import {
  fetchDispatcherFleetWorkOrders,
  type DispatcherFleetWorkOrder as WorkOrder,
} from "@/application/queries/dispatcher-work-orders.query";

const activeStatuses = ["scheduled", "assigned", "en_route", "arrived", "in_progress"];

type CustomerGroup = {
  key: string;
  clientId: string;
  clientName: string;
  orders: WorkOrder[];
  total: number;
};

export default function FleetWorkOrdersInvoicingPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const clientFilter = searchParams.get("client");
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Completed WO selection (for invoicing)
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Single-WO complete dialog
  const [completeOrder, setCompleteOrder] = useState<WorkOrder | null>(null);

  const [working, setWorking] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceFullRow | null>(null);

  // Preview dialog state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [processingFeeEnabled, setProcessingFeeEnabled] = useState(false);
  const [processingFeeType, setProcessingFeeType] = useState<"percentage" | "fixed">("percentage");
  const [processingFeeValue, setProcessingFeeValue] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await fetchDispatcherFleetWorkOrders());
    } catch {
      toast.error("Unable to load fleet work orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void fetchPaymentSettings()
      .then(({ settings }) => {
        setTaxRate(String(settings.tax_rate || 0));
        setProcessingFeeEnabled(settings.surcharge_enabled);
        setProcessingFeeType(settings.surcharge_type);
        setProcessingFeeValue(String(settings.surcharge_value || 0));
      })
      .catch((error) => console.warn("[fleetInvoicing] Unable to load fee defaults", error));
  }, []);

  const active = useMemo(
    () => orders.filter((order) => activeStatuses.includes(order.status) && (!clientFilter || order.fleet_client_id === clientFilter)),
    [clientFilter, orders],
  );
  const completed = useMemo(
    () => orders.filter((order) => order.status === "completed" && (!clientFilter || order.fleet_client_id === clientFilter)),
    [clientFilter, orders],
  );
  const filteredClientName = clientFilter
    ? orders.find((order) => order.fleet_client_id === clientFilter)?.fleet_clients?.company_name
    : null;

  // Group selected completed WOs by customer.
  const groups: CustomerGroup[] = useMemo(() => {
    const byClient = new Map<string, CustomerGroup>();
    for (const order of completed) {
      if (!selected.has(order.id)) continue;
      const invoiceGroup = evaluateFleetInvoiceCompliance([order]).invoiceGroup;
      const key = `${order.fleet_client_id}:${invoiceGroup}`;
      const name = order.fleet_clients?.company_name || "Unknown customer";
      const bucket = byClient.get(key) ?? { key, clientId: order.fleet_client_id, clientName: name, orders: [], total: 0 };
      bucket.orders.push(order);
      bucket.total += Number(order.total || 0);
      byClient.set(key, bucket);
    }
    return [...byClient.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [completed, selected]);

  const complianceByGroup = useMemo(
    () => new Map(groups.map((group) => [group.key, evaluateFleetInvoiceCompliance(group.orders)])),
    [groups],
  );
  const complianceErrors = [...complianceByGroup.values()].flatMap((result) => result.errors);
  const totalsFor = (subtotal: number, groupKey?: string) => {
    const taxExempt = groupKey ? complianceByGroup.get(groupKey)?.taxExempt : false;
    return calculateFleetInvoiceTotals(subtotal, {
      taxEnabled: taxEnabled && !taxExempt,
      taxRate: Number(taxRate) || 0,
      processingFeeEnabled,
      processingFeeType,
      processingFeeValue: Number(processingFeeValue) || 0,
    });
  };
  const grandTotal = groups.reduce((sum, group) => sum + totalsFor(group.total, group.key).total, 0);

  const prepareDueBatches = () => {
    const dueIds = completed
      .filter((order) => {
        const result = evaluateFleetInvoiceCompliance([order]);
        return result.due && result.errors.length === 0;
      })
      .map((order) => order.id);
    setSelected(new Set(dueIds));
    if (dueIds.length === 0) toast.info("No contract billing batches are due and ready.");
    else toast.success(`Prepared ${dueIds.length} due work order${dueIds.length === 1 ? "" : "s"} for review`);
  };

  const toggle = (order: WorkOrder) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(order.id)) next.delete(order.id);
      else next.add(order.id);
      return next;
    });
  };

  const handleCreateInvoices = async () => {
    if (groups.length === 0) return;
    setWorking(true);
    let created = 0;
    let lastInvoice: InvoiceFullRow | null = null;
    try {
      for (const group of groups) {
        try {
          const invoiceRes = await createInvoiceFromFleetWorkOrders(group.orders.map((o) => o.id), {
            taxEnabled: taxEnabled && !complianceByGroup.get(group.key)?.taxExempt,
            taxRate: Number(taxRate) || 0,
            processingFeeEnabled,
            processingFeeType,
            processingFeeValue: Number(processingFeeValue) || 0,
          });
          const invoiceId = invoiceRes.invoice_id;
          lastInvoice = await fetchInvoiceDetail(invoiceId);
          created += 1;
        } catch (error) {
          console.error("[createInvoices]", group.clientId, error);
          toast.error(
            `Failed for ${group.clientName}: ${error instanceof Error ? error.message : "Unable to create invoice"}`,
          );
        }
      }
      if (created > 0) {
        toast.success(`Created ${created} invoice${created === 1 ? "" : "s"}`);
        setInvoice(lastInvoice);
        setSelected(new Set());
        setPreviewOpen(false);
        await load();
      }
    } finally {
      setWorking(false);
    }
  };

  const orderLabel = (order: WorkOrder) => order.order_number || `WO-${order.id.slice(0, 8)}`;
  const vehicleLabel = (order: WorkOrder) => order.fleet_vehicles
    ? `${order.fleet_vehicles.year} ${order.fleet_vehicles.make} ${order.fleet_vehicles.model}${order.fleet_vehicles.unit_number ? ` · Unit ${order.fleet_vehicles.unit_number}` : ""}`
    : "Vehicle unavailable";

  return (
    <FleetOSLayout title="Work Orders & Invoicing">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Close work, then invoice it</h1>
            <p className="text-sm text-muted-foreground">
              Bulk-complete active work, then build contract-compliant invoices by customer and invoice group.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/fleet-os")}>Back to Fleet OS</Button>
            <Button variant="outline" onClick={prepareDueBatches} disabled={loading || working || completed.length === 0}>
              Prepare due batches
            </Button>
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(true)}
              disabled={!selected.size || working}
            >
              <Eye className="mr-2 h-4 w-4" />
              Preview invoice ({groups.length})
            </Button>
          </div>
        </div>

        {clientFilter && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
            <span>
              Showing work orders for <strong>{filteredClientName || "the selected fleet client"}</strong>.
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSearchParams({})}>Show all clients</Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4" />Active work orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : active.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No active fleet work orders.</p> : active.map((order) => (
              <div key={order.id} className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center">
                <button className="flex-1 text-left" onClick={() => navigate(`/fleet-os/work-orders/${order.id}`)}>
                  <div className="flex items-center gap-2"><span className="font-medium">{orderLabel(order)}</span><Badge variant="secondary">{order.status.replace("_", " ")}</Badge></div>
                  <p className="text-sm text-muted-foreground">{order.fleet_clients?.company_name} · {vehicleLabel(order)}</p>
                </button>
                <Button size="sm" variant="outline" onClick={() => setCompleteOrder(order)}>Complete…</Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" />Completed and ready to invoice</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {completed.length === 0 ? <p className="py-5 text-center text-sm text-muted-foreground">No completed work orders are waiting for an invoice.</p> : completed.map((order) => (
              <label key={order.id} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 hover:bg-muted/40">
                <Checkbox checked={selected.has(order.id)} onCheckedChange={() => toggle(order)} aria-label={`Select ${orderLabel(order)}`} />
                <div className="min-w-0 flex-1"><p className="font-medium">{orderLabel(order)} · {order.fleet_clients?.company_name}</p><p className="truncate text-sm text-muted-foreground">{vehicleLabel(order)}</p></div>
                <span className="font-medium">${formatMoney(order.total || 0)}</span>
              </label>
            ))}
            {selected.size > 0 && (
              <p className="pt-2 text-sm text-muted-foreground">
                <CheckCircle2 className="mr-1 inline h-4 w-4 text-emerald-600" />
                {selected.size} work order{selected.size === 1 ? "" : "s"} selected across {groups.length} customer{groups.length === 1 ? "" : "s"} — will create {groups.length} invoice{groups.length === 1 ? "" : "s"}.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Single-WO complete dialog */}
      <CompleteFleetWorkOrderDialog
        open={Boolean(completeOrder)}
        onOpenChange={(open) => { if (!open) setCompleteOrder(null); }}
        workOrderId={completeOrder?.id ?? null}
        workOrderLabel={completeOrder ? orderLabel(completeOrder) : undefined}
        defaultMileage={completeOrder?.fleet_vehicles?.mileage}
        onCompleted={async () => { setCompleteOrder(null); await load(); }}
      />

      {/* Invoice preview dialog */}
      <Dialog open={previewOpen} onOpenChange={(open) => !working && setPreviewOpen(open)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Invoice preview</DialogTitle>
            <DialogDescription>
              Review before creating {groups.length} Stripe-payable invoice{groups.length === 1 ? "" : "s"}.
              Each customer and contract invoice group receives one combined invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-auto">
            <div className="grid gap-4 rounded-md border bg-muted/20 p-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="bulk-sales-tax">Include sales tax</Label>
                  <Switch id="bulk-sales-tax" checked={taxEnabled} onCheckedChange={setTaxEnabled} />
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Sales tax rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.001"
                    value={taxRate}
                    onChange={(event) => setTaxRate(event.target.value)}
                    disabled={!taxEnabled}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="bulk-card-fee">Include card processing fee</Label>
                  <Switch id="bulk-card-fee" checked={processingFeeEnabled} onCheckedChange={setProcessingFeeEnabled} />
                </div>
                <div className="flex gap-2">
                  <Select value={processingFeeType} onValueChange={(value: "percentage" | "fixed") => setProcessingFeeType(value)} disabled={!processingFeeEnabled}>
                    <SelectTrigger aria-label="Processing fee type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percent</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    aria-label="Processing fee value"
                    type="number"
                    min="0"
                    step="0.01"
                    value={processingFeeValue}
                    onChange={(event) => setProcessingFeeValue(event.target.value)}
                    disabled={!processingFeeEnabled}
                  />
                  <span className="self-center text-sm text-muted-foreground">{processingFeeType === "percentage" ? "%" : "$"}</span>
                </div>
              </div>
            </div>
            {groups.map((group) => (
              <div key={group.key} className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                  <div className="font-medium">{group.clientName}</div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">{group.orders.length} WO · </span>
                    <span className="font-semibold">${formatMoney(totalsFor(group.total, group.key).total)}</span>
                  </div>
                </div>
                <ul className="divide-y">
                  {group.orders.map((order) => (
                    <li key={order.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{orderLabel(order)}</p>
                        <p className="truncate text-xs text-muted-foreground">{vehicleLabel(order)}</p>
                      </div>
                      <span>${formatMoney(order.total || 0)}</span>
                    </li>
                  ))}
                </ul>
                {(taxEnabled || processingFeeEnabled) && (
                  <div className="space-y-1 border-t px-3 py-2 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Work subtotal</span><span>${formatMoney(group.total)}</span></div>
                    {processingFeeEnabled && <div className="flex justify-between"><span>Card processing fee</span><span>${formatMoney(totalsFor(group.total, group.key).processingFee)}</span></div>}
                    {taxEnabled && !complianceByGroup.get(group.key)?.taxExempt && <div className="flex justify-between"><span>Sales tax ({Number(taxRate) || 0}%)</span><span>${formatMoney(totalsFor(group.total, group.key).tax)}</span></div>}
                  </div>
                )}
                {complianceByGroup.get(group.key) && (
                  <div className="space-y-1 border-t px-3 py-2 text-xs">
                    <div className="flex flex-wrap gap-x-4 text-muted-foreground">
                      <span>Group: {complianceByGroup.get(group.key)!.invoiceGroup}</span>
                      <span>Cadence: {complianceByGroup.get(group.key)!.invoiceFrequency.replace("_", " ")}</span>
                      <span>Terms: {complianceByGroup.get(group.key)!.paymentTerms.replace(/_/g, " ")}</span>
                      <span>Recipient: {complianceByGroup.get(group.key)!.recipientEmail || "missing"}</span>
                    </div>
                    {complianceByGroup.get(group.key)!.errors.map((message) => (
                      <p key={message} className="font-medium text-destructive">Blocked: {message}</p>
                    ))}
                    {complianceByGroup.get(group.key)!.warnings.map((message) => (
                      <p key={message} className="text-amber-700 dark:text-amber-400">Warning: {message}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {groups.length > 1 && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Grand total across all invoices</span>
                <span className="font-semibold">${formatMoney(grandTotal)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} disabled={working}>Back</Button>
            <Button onClick={handleCreateInvoices} disabled={working || groups.length === 0 || complianceErrors.length > 0}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
              Create {groups.length} invoice{groups.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SendInvoiceDialog invoice={invoice} open={Boolean(invoice)} onOpenChange={(open) => !open && setInvoice(null)} onSent={load} />
    </FleetOSLayout>
  );
}
