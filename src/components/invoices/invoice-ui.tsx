import { differenceInCalendarDays, parseISO, startOfToday } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Shared presentational helpers for the invoices surface.
 * Pure display logic only — no data fetching or mutations.
 */

export interface InvoiceMoneyRow {
  status: string;
  total: number;
  amount_paid: number;
  due_date: string | null;
}

const SETTLED_STATUSES = new Set(["paid", "void"]);

/** Remaining balance, never negative. */
export function invoiceBalance(row: InvoiceMoneyRow): number {
  return Math.max(Number(row.total) - Number(row.amount_paid || 0), 0);
}

/** True when the invoice is past due and still has a balance. */
export function isInvoiceOverdue(row: InvoiceMoneyRow): boolean {
  if (!row.due_date || SETTLED_STATUSES.has(row.status)) return false;
  if (invoiceBalance(row) <= 0.01) return false;
  try {
    return differenceInCalendarDays(startOfToday(), parseISO(row.due_date)) > 0;
  } catch {
    return false;
  }
}

/** Whole days past the due date (0 when not overdue). */
export function overdueDays(row: InvoiceMoneyRow): number {
  if (!isInvoiceOverdue(row) || !row.due_date) return 0;
  return differenceInCalendarDays(startOfToday(), parseISO(row.due_date));
}

const PILL_STYLES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  partial: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  void: "bg-muted text-muted-foreground border-border",
};

const PILL_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  partial: "Partial",
  paid: "Paid",
  void: "Void",
};

/** Pastel status pill — categorization only, never a CTA. */
export function InvoiceStatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        PILL_STYLES[status] ?? "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {PILL_LABELS[status] ?? status}
    </span>
  );
}

/** Red pill for overdue invoices — critical money alert. */
export function OverduePill({ days, className }: { days?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-destructive/25 bg-destructive/10 px-2.5 py-0.5 text-xs font-semibold text-destructive",
        className,
      )}
    >
      {typeof days === "number" && days > 0 ? `Overdue ${days}d` : "Overdue"}
    </span>
  );
}
