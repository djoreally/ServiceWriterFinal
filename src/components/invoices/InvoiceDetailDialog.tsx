import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Mail, Pencil, Printer, Trash2, Car, AlertCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import {
  fetchInvoiceDetail,
  type InvoiceFullRow,
} from "@/application/queries/invoices.query";
import {
  deleteInvoice,
  recordFleetInvoicePayment,
} from "@/application/commands/invoices.command";
import {
  invoiceBalance,
  isInvoiceOverdue,
  overdueDays,
  InvoiceStatusPill,
  OverduePill,
} from "./invoice-ui";
import { SendInvoiceDialog } from "./SendInvoiceDialog";
import { cn } from "@/lib/utils";

interface Props {
  invoiceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (id: string) => void;
  onChanged?: () => void;
}

export function InvoiceDetailDialog({ invoiceId, open, onOpenChange, onEdit, onChanged }: Props) {
  const { formatCurrency } = useRegionalSettings();
  const [invoice, setInvoice] = useState<InvoiceFullRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    fetchInvoiceDetail(invoiceId)
      .then((d) => { if (!cancelled) setInvoice(d); })
      .catch((err) => {
        console.error("[InvoiceDetailDialog] fetch failed", err);
        if (!cancelled) {
          setLoadError(true);
          toast.error("Failed to load invoice");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, reloadToken]);

  useEffect(() => {
    if (!open) void Promise.resolve().then(() => { setInvoice(null); setLoadError(false); });
  }, [open]);

  const billToName = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.company_name ?? "Fleet client"
    : invoice?.customers?.name ?? "Customer";
  const billToEmail = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.billing_email ?? invoice?.fleet_clients?.ap_contact_email ?? null
    : invoice?.customers?.email ?? null;

  const balance = invoice ? invoiceBalance(invoice) : 0;
  const overdue = invoice ? isInvoiceOverdue(invoice) : false;
  const collectable = !!invoice && !["paid", "void"].includes(invoice.status) && balance > 0.01;
  const showRecordPayment = !!invoice && !["paid", "void"].includes(invoice.status);

  const handleSend = () => {
    if (!invoice) return;
    setSendOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > balance) {
      toast.error(`Enter an amount between 0.01 and ${formatCurrency(balance)}`);
      return;
    }
    setRecordingPayment(true);
    try {
      await recordFleetInvoicePayment({ invoiceId: invoice.id, amount, note: paymentNote.trim() || undefined });
      setInvoice(await fetchInvoiceDetail(invoice.id));
      setPaymentOpen(false);
      setPaymentAmount("");
      setPaymentNote("");
      toast.success("Payment recorded and reconciled");
      onChanged?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to record payment");
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    if (!confirm(`Delete invoice ${invoice.invoice_number}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteInvoice(invoice.id);
      toast.success("Invoice deleted");
      onChanged?.();
      onOpenChange(false);
    } catch (err) {
      console.error("[InvoiceDetailDialog] delete failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to delete invoice");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:max-w-full">
        <DialogHeader>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice</p>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-lg font-semibold">{invoice?.invoice_number ?? "Invoice"}</span>
            {invoice && <InvoiceStatusPill status={invoice.status} />}
            {invoice && overdue && <OverduePill days={overdueDays(invoice)} />}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-20 w-2/3 rounded-lg ml-auto" />
          </div>
        ) : loadError ? (
          <div className="py-12 text-center space-y-3">
            <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
            <p className="font-semibold">Couldn&apos;t load this invoice</p>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
            <Button variant="outline" onClick={() => setReloadToken((t) => t + 1)}>Try again</Button>
          </div>
        ) : !invoice ? null : (
          <div className="space-y-5 text-sm">
            {/* The money answer first: total, paid, balance */}
            <section aria-label="Amounts" className="grid grid-cols-3 gap-3 rounded-xl border bg-muted/30 p-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total</p>
                <p className="font-mono text-lg font-semibold tabular-nums mt-1">{formatCurrency(Number(invoice.total))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Paid</p>
                <p className="font-mono text-lg tabular-nums mt-1">{formatCurrency(Number(invoice.amount_paid || 0))}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Balance due</p>
                <p className={cn(
                  "font-mono text-lg font-semibold tabular-nums mt-1",
                  balance > 0.01 ? (overdue ? "text-destructive" : "text-primary") : "text-muted-foreground",
                )}>
                  {formatCurrency(balance)}
                </p>
              </div>
            </section>
            {overdue && (
              <p className="text-sm font-medium text-destructive -mt-2">
                Overdue {overdueDays(invoice)} days · due {invoice.due_date && format(parseISO(invoice.due_date), "MMM d, yyyy")}. A reminder keeps cash flowing.
              </p>
            )}

            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Bill To</p>
                <p className="font-semibold mt-1">{billToName}</p>
                {billToEmail && <p className="text-muted-foreground">{billToEmail}</p>}
                {invoice.customers?.phone && (
                  <p className="text-muted-foreground font-mono text-[13px]">{invoice.customers.phone}</p>
                )}
                {invoice.customers?.address && (
                  <p className="text-muted-foreground">{invoice.customers.address}</p>
                )}
              </div>
              <div className="text-right space-y-1">
                <p>
                  <span className="text-muted-foreground">Issued: </span>
                  <span className="font-mono text-[13px]">{format(parseISO(invoice.issue_date), "MMM d, yyyy")}</span>
                </p>
                {invoice.due_date && (
                  <p>
                    <span className="text-muted-foreground">Due: </span>
                    <span className={cn("font-mono text-[13px]", overdue && "text-destructive font-semibold")}>
                      {format(parseISO(invoice.due_date), "MMM d, yyyy")}
                    </span>
                  </p>
                )}
                {invoice.payment_terms && (
                  <p className="text-muted-foreground">{invoice.payment_terms}</p>
                )}
              </div>
            </section>

            <Separator />

            {/* Line items, grouped by vehicle — the work behind the money */}
            <section aria-label="Line items" className="space-y-3">
              {(() => {
                const groups = new Map<string, typeof invoice.invoice_line_items>();
                for (const li of invoice.invoice_line_items) {
                  const key = li.vin || "__nov__";
                  const arr = groups.get(key) ?? [];
                  arr.push(li);
                  groups.set(key, arr);
                }
                return Array.from(groups.entries()).map(([vin, lines]) => {
                  const head = lines[0];
                  return (
                    <div key={vin} className="rounded-xl border overflow-hidden">
                      {(head.vin || head.vehicle_make) && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-muted/40 border-b">
                          <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-xs">
                            {[head.vehicle_year, head.vehicle_make, head.vehicle_model, head.vehicle_trim]
                              .filter(Boolean)
                              .join(" ") || "Vehicle"}
                          </span>
                          {head.vin && (
                            <span className="font-mono text-[11px] text-muted-foreground">{head.vin}</span>
                          )}
                        </div>
                      )}
                      <div className="divide-y">
                        {lines.map((l) => (
                          <div key={l.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-baseline">
                            <div className="col-span-7">
                              <p className="text-sm whitespace-pre-wrap">{l.description}</p>
                            </div>
                            <div className="col-span-2 text-right font-mono text-xs text-muted-foreground tabular-nums">
                              {Number(l.quantity)} × {formatCurrency(Number(l.unit_price))}
                            </div>
                            <div className="col-span-3 text-right font-mono text-sm tabular-nums">
                              {formatCurrency(Number(l.line_total))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </section>

            <Separator />

            <section aria-label="Totals" className="ml-auto max-w-xs space-y-1.5">
              <MoneyRow
                label={invoice.surcharge_enabled ? "Work subtotal" : "Subtotal"}
                value={formatCurrency(
                  Number(invoice.subtotal) - (invoice.surcharge_enabled ? Number(invoice.surcharge) : 0),
                )}
              />
              {invoice.surcharge_enabled && Number(invoice.surcharge) > 0 && (
                <MoneyRow label="Credit card processing fee" value={formatCurrency(Number(invoice.surcharge))} />
              )}
              {Number(invoice.discount_amount) > 0 && (
                <MoneyRow
                  label="Discount"
                  value={`−${formatCurrency(Number(invoice.discount_amount))}`}
                  valueClassName="text-primary"
                />
              )}
              {invoice.tax_enabled && (
                <MoneyRow
                  label={`Tax (${Number(invoice.tax_rate)}%)`}
                  value={formatCurrency(Number(invoice.tax_amount))}
                />
              )}
              <Separator className="my-1" />
              <MoneyRow label="Total" value={formatCurrency(Number(invoice.total))} bold />
              {Number(invoice.amount_paid) > 0 && (
                <MoneyRow label="Paid" value={formatCurrency(Number(invoice.amount_paid))} />
              )}
              <LineItemCheck invoice={invoice} formatCurrency={formatCurrency} />
            </section>

            {invoice.notes && (
              <>
                <Separator />
                <section>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
                </section>
              </>
            )}
            {invoice.delivery_status === "failed" && (
              <section className="rounded-xl border border-destructive/25 bg-destructive/[0.06] p-4 text-sm">
                <p className="font-semibold text-destructive">Last delivery failed</p>
                <p className="mt-1 text-muted-foreground">{invoice.delivery_last_error || "The invoice email provider returned an unknown error."}</p>
                <p className="mt-1 text-xs text-muted-foreground">Attempts: {invoice.delivery_attempt_count}. Use Send Invoice below to retry.</p>
              </section>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!invoice || deleting}
            className="gap-2 mr-auto"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
          <Button
            variant="outline"
            onClick={() => window.print()}
            disabled={!invoice}
            className="gap-2"
          >
            <Printer className="h-4 w-4" /> Print
          </Button>
          <Button
            variant="outline"
            onClick={() => invoice && onEdit?.(invoice.id)}
            disabled={!invoice}
            className="gap-2"
          >
            <Pencil className="h-4 w-4" /> Edit
          </Button>
          {showRecordPayment && (
            <Button
              variant={collectable ? "default" : "outline"}
              onClick={() => { setPaymentAmount(String(balance.toFixed(2))); setPaymentOpen(true); }}
            >
              Record payment
            </Button>
          )}
          <Button
            variant={collectable ? "outline" : "default"}
            onClick={handleSend}
            disabled={!invoice}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Send invoice
          </Button>
        </DialogFooter>
      </DialogContent>

      <SendInvoiceDialog
        invoice={invoice}
        open={sendOpen}
        onOpenChange={setSendOpen}
        onSent={() => {
          onChanged?.();
          onOpenChange(false);
        }}
      />

      <Dialog open={paymentOpen} onOpenChange={(open) => !recordingPayment && setPaymentOpen(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record invoice payment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Balance due</span>
              <span className="font-mono font-semibold tabular-nums">{formatCurrency(balance)}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="invoice-payment-amount">Amount</Label>
                <button
                  type="button"
                  onClick={() => setPaymentAmount(String(balance.toFixed(2)))}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Use full balance
                </button>
              </div>
              <Input id="invoice-payment-amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            </div>
            <div className="space-y-1"><Label htmlFor="invoice-payment-note">Reference or note</Label><Input id="invoice-payment-note" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Check, ACH, or reconciliation reference" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={recordingPayment}>Cancel</Button><Button onClick={handleRecordPayment} disabled={recordingPayment}>{recordingPayment ? "Recording…" : "Record payment"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function MoneyRow({ label, value, bold, valueClassName }: { label: string; value: string; bold?: boolean; valueClassName?: string }) {
  return (
    <div className={cn("flex justify-between gap-4 text-sm", bold && "text-base font-semibold")}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-mono tabular-nums", valueClassName)}>{value}</span>
    </div>
  );
}

/** Display-only check: line items should add up to the shown subtotal. */
function LineItemCheck({ invoice, formatCurrency }: { invoice: InvoiceFullRow; formatCurrency: (n: number) => string }) {
  const itemSum = invoice.invoice_line_items.reduce((s, l) => s + (Number(l.line_total) || 0), 0);
  const shownSubtotal = Number(invoice.subtotal) - (invoice.surcharge_enabled ? Number(invoice.surcharge) : 0);
  if (Math.abs(itemSum - shownSubtotal) <= 0.01) return null;
  return (
    <p className="text-xs text-amber-700 dark:text-amber-500 pt-1">
      Line items add up to {formatCurrency(itemSum)} — double-check before sending.
    </p>
  );
}
