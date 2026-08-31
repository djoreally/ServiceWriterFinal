import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Pencil, Printer, Trash2, Car } from "lucide-react";
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
import { SendInvoiceDialog } from "./SendInvoiceDialog";

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
  const [sendOpen, setSendOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) return;
    let cancelled = false;
    void Promise.resolve().then(() => setLoading(true));
    void Promise.resolve().then(() => fetchInvoiceDetail(invoiceId)
      .then((d) => !cancelled && setInvoice(d))
      .catch((err) => {
        console.error("[InvoiceDetailDialog] fetch failed", err);
        toast.error("Failed to load invoice");
      })
      .finally(() => !cancelled && setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  useEffect(() => {
    if (!open) void Promise.resolve().then(() => setInvoice(null));
  }, [open]);

  const billToName = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.company_name ?? "Fleet client"
    : invoice?.customers?.name ?? "Customer";
  const billToEmail = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.billing_email ?? invoice?.fleet_clients?.ap_contact_email ?? null
    : invoice?.customers?.email ?? null;

  const handleSend = () => {
    if (!invoice) return;
    setSendOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = Number(paymentAmount);
    const balance = Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));
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
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="font-mono">{invoice?.invoice_number ?? "Invoice"}</span>
            {invoice && (
              <Badge variant="outline" className="capitalize">{invoice.status}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading || !invoice ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 text-sm">
            <section className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Bill To</p>
                <p className="font-bold">{billToName}</p>
                {billToEmail && <p className="text-muted-foreground">{billToEmail}</p>}
                {invoice.customers?.phone && (
                  <p className="text-muted-foreground">{invoice.customers.phone}</p>
                )}
                {invoice.customers?.address && (
                  <p className="text-muted-foreground">{invoice.customers.address}</p>
                )}
              </div>
              <div className="text-right">
                <p>
                  <span className="text-muted-foreground">Issued: </span>
                  {format(parseISO(invoice.issue_date), "MMM d, yyyy")}
                </p>
                {invoice.due_date && (
                  <p>
                    <span className="text-muted-foreground">Due: </span>
                    {format(parseISO(invoice.due_date), "MMM d, yyyy")}
                  </p>
                )}
                {invoice.payment_terms && (
                  <p className="text-muted-foreground">{invoice.payment_terms}</p>
                )}
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
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
                    <div key={vin} className="rounded-lg border">
                      {(head.vin || head.vehicle_make) && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                          <Car className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="font-medium text-xs">
                            {[head.vehicle_year, head.vehicle_make, head.vehicle_model, head.vehicle_trim]
                              .filter(Boolean)
                              .join(" ") || "Vehicle"}
                          </span>
                          {head.vin && (
                            <span className="font-mono text-[10px] text-muted-foreground">{head.vin}</span>
                          )}
                        </div>
                      )}
                      <div className="divide-y">
                        {lines.map((l) => (
                          <div key={l.id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                            <div className="col-span-7">
                              <p className="font-medium text-sm whitespace-pre-wrap">{l.description}</p>
                            </div>
                            <div className="col-span-2 text-right text-muted-foreground">
                              {Number(l.quantity)} × {formatCurrency(Number(l.unit_price))}
                            </div>
                            <div className="col-span-3 text-right font-bold">
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

            <section className="ml-auto max-w-xs space-y-1">
              <Row
                label={invoice.surcharge_enabled ? "Work subtotal" : "Subtotal"}
                value={formatCurrency(
                  Number(invoice.subtotal) - (invoice.surcharge_enabled ? Number(invoice.surcharge) : 0),
                )}
              />
              {invoice.surcharge_enabled && Number(invoice.surcharge) > 0 && (
                <Row label="Credit card processing fee" value={formatCurrency(Number(invoice.surcharge))} />
              )}
              {Number(invoice.discount_amount) > 0 && (
                <Row
                  label="Discount"
                  value={`−${formatCurrency(Number(invoice.discount_amount))}`}
                  accent
                />
              )}
              {invoice.tax_enabled && (
                <Row
                  label={`Tax (${Number(invoice.tax_rate)}%)`}
                  value={formatCurrency(Number(invoice.tax_amount))}
                />
              )}
              <Separator className="my-1" />
              <Row label="Total" value={formatCurrency(Number(invoice.total))} bold />
              {Number(invoice.amount_paid) > 0 && (
                <Row label="Paid" value={formatCurrency(Number(invoice.amount_paid))} />
              )}
            </section>

            {invoice.notes && (
              <>
                <Separator />
                <section>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-1">Notes</p>
                  <p className="whitespace-pre-wrap text-muted-foreground">{invoice.notes}</p>
                </section>
              </>
            )}
            {invoice.delivery_status === "failed" && (
              <section className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Last delivery failed</p>
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
          {invoice && !["paid", "void"].includes(invoice.status) && (
            <Button variant="outline" onClick={() => { setPaymentAmount(String(Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0)))); setPaymentOpen(true); }}>
              Record payment
            </Button>
          )}
          <Button onClick={handleSend} disabled={!invoice} className="gap-2">
            <Mail className="h-4 w-4" />
            Send Invoice
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
            <div className="space-y-1"><Label htmlFor="invoice-payment-amount">Amount</Label><Input id="invoice-payment-amount" type="number" min="0.01" step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="invoice-payment-note">Reference or note</Label><Input id="invoice-payment-note" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="Check, ACH, or reconciliation reference" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setPaymentOpen(false)} disabled={recordingPayment}>Cancel</Button><Button onClick={handleRecordPayment} disabled={recordingPayment}>{recordingPayment ? "Recording…" : "Record payment"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-black" : ""} ${accent ? "text-primary" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
