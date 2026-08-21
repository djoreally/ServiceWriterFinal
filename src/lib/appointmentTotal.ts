/**
 * Appointment Total — single source of truth for the fully-loaded
 * "what the customer pays" amount for an appointment.
 *
 * Used by every card, list, dialog, and detail view so all surfaces
 * display the same number. Mirrors the formula used in AppointmentDetail:
 *   subtotal (from estimated_cost) → + waste oil → + shop fee → + surcharge → + tax = total
 */
import { computeFinancialSummary, type FeeSettings } from "@/lib/financialMath";

export interface AppointmentLineItem {
  price?: number | null;
  quantity?: number | null;
}

export interface AppointmentLike {
  estimated_cost?: number | null;
  tax_amount?: number | null;
  /**
   * Optional joined line items. When present, their sum is used as the
   * canonical subtotal — this matches what AppointmentDetail computes from
   * AppointmentServicesList and avoids double-counting fees that may already
   * have been baked into a stale `estimated_cost` value.
   */
  appointment_services?: AppointmentLineItem[] | null;
}

export interface AppointmentFeeSettings extends FeeSettings {
  tax_rate?: number | null;
}

/**
 * Compute the canonical fully-loaded total for an appointment in dollars.
 * Returns 0 when no subtotal is available.
 *
 * Subtotal resolution priority (must mirror AppointmentDetail):
 *   1. Sum of `appointment_services` line items (price × quantity) — truth.
 *   2. Fallback to `appointment.estimated_cost` when no line items are joined.
 */
export function computeAppointmentTotal(
  appointment: AppointmentLike | null | undefined,
  feeSettings: AppointmentFeeSettings | null | undefined,
): number {
  const lineItems = appointment?.appointment_services;
  const lineItemSubtotal = Array.isArray(lineItems) && lineItems.length > 0
    ? lineItems.reduce(
        (sum, li) => sum + Number(li?.price ?? 0) * Number(li?.quantity ?? 1),
        0,
      )
    : 0;
  const subtotal = lineItemSubtotal > 0
    ? lineItemSubtotal
    : Number(appointment?.estimated_cost ?? 0);
  if (!subtotal && !appointment?.tax_amount) return 0;

  const taxAmount = Number(appointment?.tax_amount ?? 0);
  const summary = computeFinancialSummary({
    subtotal,
    feeSettings: feeSettings ?? undefined,
    taxAmount: taxAmount > 0 ? taxAmount : undefined,
    // If no explicit tax_amount was stamped, fall back to business default tax_rate.
    taxRate:
      taxAmount > 0
        ? undefined
        : feeSettings?.tax_rate != null
          ? Number(feeSettings.tax_rate) / 100
          : undefined,
  });
  return summary.total;
}
