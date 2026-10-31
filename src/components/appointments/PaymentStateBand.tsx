import { CheckCircle2, CircleDollarSign, Clock } from "lucide-react";
import { formatMoney } from "@/lib/financialMath";
import { invoiceStatusView } from "@/lib/status-vocabulary";
import { cn } from "@/lib/utils";

/**
 * Payment State Band (Batch 2 spec component) — the ONE money headline on
 * the job screen: what is owed, what is paid, which invoice says so.
 *
 * SEAM (flagged, not papered over): B5's composed `payment_state` field
 * does not exist yet. This band renders the existing invoice facts exactly
 * as they are — invoice status (B1 vocabulary), total, amount_paid — fed
 * from the same computed summary the totals block below it uses, so the
 * band and the itemization can never disagree. When B5 lands, this
 * component's props become the composed field and nothing else changes.
 */
export interface PaymentStateBandProps {
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  total: number;
  amountPaid: number;
  balance: number;
  onViewPayments?: () => void;
}

export function PaymentStateBand({ invoiceNumber, invoiceStatus, total, amountPaid, balance, onViewPayments }: PaymentStateBandProps) {
  if (!invoiceNumber) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
        <Clock className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-display text-base font-bold">No invoice yet</p>
          <p className="text-sm text-muted-foreground">Payment state appears here once the job is invoiced.</p>
        </div>
      </div>
    );
  }

  const statusView = invoiceStatusView(invoiceStatus);
  const paidInFull = balance <= 0 && total > 0;
  const partiallyPaid = !paidInFull && amountPaid > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        {paidInFull ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-status-completed-fg" />
        ) : (
          <CircleDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-extrabold leading-tight">
            {paidInFull
              ? `Paid in full · $${formatMoney(total)}`
              : partiallyPaid
                ? `Balance due $${formatMoney(balance)}`
                : `Due $${formatMoney(balance)}`}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {invoiceNumber} · {statusView.status_label ?? "Issued"}
            {partiallyPaid ? ` · $${formatMoney(amountPaid)} paid` : ""}
          </p>
        </div>
        {onViewPayments && (
          <button
            type="button"
            onClick={onViewPayments}
            className={cn("shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-primary hover:bg-secondary")}
          >
            Payments
          </button>
        )}
      </div>
    </div>
  );
}
