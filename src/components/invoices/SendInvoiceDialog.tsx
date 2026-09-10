import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Mail } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { sendInvoiceEmail } from "@/application/commands/invoice-send.command";
import type { InvoiceFullRow } from "@/application/queries/invoices.query";

interface Props {
  invoice: InvoiceFullRow | null;
  businessName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SendInvoiceDialog({ invoice, businessName, open, onOpenChange, onSent }: Props) {
  const { formatCurrency } = useRegionalSettings();
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const amountPaid = Math.max(0, Number(invoice?.amount_paid || 0));
  const total = Math.max(0, Number(invoice?.total || 0));
  const balanceDue = Math.max(0, Number((total - amountPaid).toFixed(2)));
  const isPaid = invoice?.status === "paid" || (!!invoice && balanceDue < 0.01);
  const isPartial = !!invoice && !isPaid && amountPaid > 0;

  useEffect(() => {
    if (!open || !invoice) return;
    const isFleet = invoice.bill_to_type === "fleet";
    const defaultEmail = isFleet
      ? invoice.fleet_clients?.billing_email ?? invoice.fleet_clients?.ap_contact_email ?? ""
      : invoice.customers?.email ?? "";
    const billToName = isFleet
      ? invoice.fleet_clients?.company_name ?? "Customer"
      : invoice.customers?.name ?? invoice.contact_name ?? "Customer";
    const biz = businessName || "your shop";
    const paid = Math.max(0, Number(invoice.amount_paid || 0));
    const invoiceTotal = Math.max(0, Number(invoice.total || 0));
    const balance = Math.max(0, Number((invoiceTotal - paid).toFixed(2)));
    const paidInFull = invoice.status === "paid" || balance < 0.01;
    const partiallyPaid = !paidInFull && paid > 0;

    void Promise.resolve().then(() => setRecipient(invoice.contact_email ?? defaultEmail ?? ""));
    void Promise.resolve().then(() => setSubject(
      paidInFull
        ? `Paid invoice ${invoice.invoice_number} from ${biz}`
        : partiallyPaid
          ? `Invoice ${invoice.invoice_number} — ${formatCurrency(balance)} remaining`
          : `Invoice ${invoice.invoice_number} from ${biz} — ${formatCurrency(invoiceTotal)}`,
    ));
    void Promise.resolve().then(() => setMessage(
      paidInFull
        ? `Hi ${billToName},\n\nThis invoice is paid in full. Here is your final invoice for your records.\n\nThanks,\n${biz}`
        : partiallyPaid
          ? `Hi ${billToName},\n\nWe received ${formatCurrency(paid)} toward invoice ${invoice.invoice_number}. The remaining balance is ${formatCurrency(balance)}.\n\nThanks,\n${biz}`
          : `Hi ${billToName},\n\nPlease find your invoice ${invoice.invoice_number} below. Let us know if you have any questions.\n\nThanks,\n${biz}`,
    ));
  }, [open, invoice, businessName, formatCurrency]);

  const billToName = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.company_name ?? "Customer"
    : invoice?.customers?.name ?? invoice?.contact_name ?? "Customer";

  const valid = recipient.trim().length > 0 && EMAIL_RE.test(recipient.trim()) && subject.trim().length > 0;

  const handleSend = async () => {
    if (!invoice || !valid) return;
    setSending(true);
    try {
      const result = await sendInvoiceEmail({
        invoiceId: invoice.id,
        recipientEmail: recipient.trim(),
        subject: subject.trim(),
        message: message.trim() || undefined,
      });
      toast.success(
        result.balance_due < 0.01
          ? `Paid invoice sent to ${recipient.trim()}`
          : `Invoice sent to ${recipient.trim()}`,
      );
      onSent?.();
      onOpenChange(false);
    } catch (err) {
      console.error("[SendInvoiceDialog] send failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to send invoice");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isPaid ? "Send paid invoice" : "Send invoice"}</DialogTitle>
          <DialogDescription>
            {isPaid
              ? `${invoice?.invoice_number ?? "This invoice"} is paid in full. The customer will receive a final invoice showing a $0.00 balance.`
              : isPartial
                ? `${formatCurrency(amountPaid)} has been recorded. The customer will see ${formatCurrency(balanceDue)} remaining.`
                : `Confirm the recipient and subject before sending ${invoice?.invoice_number ?? "this invoice"}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Bill to</div>
            <div className="font-medium">{billToName}</div>
            {amountPaid > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {formatCurrency(amountPaid)} paid · {formatCurrency(isPaid ? 0 : balanceDue)} balance due
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-recipient">Recipient email</Label>
            <Input
              id="invoice-recipient"
              type="email"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="customer@email.com"
            />
            {recipient && !EMAIL_RE.test(recipient.trim()) && (
              <p className="text-xs text-destructive">Enter a valid email address.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-subject">Subject</Label>
            <Input
              id="invoice-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invoice-message">Message (optional)</Label>
            <Textarea
              id="invoice-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
            />
            <p className="text-xs text-muted-foreground">
              The current invoice, recorded payments, and live balance are included automatically below your message.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!valid || sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {isPaid ? "Send paid invoice" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
