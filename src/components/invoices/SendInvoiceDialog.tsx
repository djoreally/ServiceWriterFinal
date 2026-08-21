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
import { toast } from "sonner";
import { useRegionalSettings } from "@/contexts/RegionalSettingsContext";
import { sendManualInvoiceEmail, markInvoiceStatus } from "@/application/commands/invoices.command";
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
    setRecipient(invoice.contact_email ?? defaultEmail ?? "");
    setSubject(
      `Invoice ${invoice.invoice_number} from ${biz} — ${formatCurrency(Number(invoice.total) || 0)}`,
    );
    setMessage(
      `Hi ${billToName},\n\nPlease find your invoice ${invoice.invoice_number} attached below. Let us know if you have any questions.\n\nThanks,\n${biz}`,
    );
  }, [open, invoice, businessName, formatCurrency]);

  const billToName = invoice?.bill_to_type === "fleet"
    ? invoice?.fleet_clients?.company_name ?? "Customer"
    : invoice?.customers?.name ?? invoice?.contact_name ?? "Customer";

  const valid = recipient.trim().length > 0 && EMAIL_RE.test(recipient.trim()) && subject.trim().length > 0;

  const handleSend = async () => {
    if (!invoice || !valid) return;
    setSending(true);
    try {
      await sendManualInvoiceEmail({
        invoiceId: invoice.id,
        recipientEmail: recipient.trim(),
        subject: subject.trim(),
        message: message.trim() || undefined,
      });
      await markInvoiceStatus(invoice.id, "sent");
      toast.success(`Invoice sent to ${recipient.trim()}`);
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
          <DialogTitle>Send invoice</DialogTitle>
          <DialogDescription>
            Confirm the recipient and subject before sending {invoice?.invoice_number ?? "this invoice"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Bill to</div>
            <div className="font-medium">{billToName}</div>
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
              The full invoice (line items and totals) is included automatically below your message.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!valid || sending} className="gap-2">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
