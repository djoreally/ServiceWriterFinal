/**
 * Appointment Total — single source of truth for the fully-loaded
 * "what the customer pays" amount for an appointment.
 *
 * IMPORTANT: list/card surfaces must display the same stamped pricing the
 * appointment detail page displays. Do not synthesize tax from the business
 * default here; only use tax that is already attached to the appointment.
 */
import { computeFinancialSummary, type FeeSettings } from "@/lib/financialMath";

export interface AppointmentLineItem {
  price?: number | null;
  quantity?: number | null;
}

export interface AppointmentLike {
  estimated_cost?: number | null;
  tax_amount?: number | null;
  appointment_services?: AppointmentLineItem[] | null;
}

export interface AppointmentFeeSettings extends FeeSettings {
  tax_rate?: number | null;
}

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

  const taxAmount = Number(appointment?.tax_amount ?? 0);
  if (!subtotal && !taxAmount) return 0;

  return computeFinancialSummary({
    subtotal,
    feeSettings: feeSettings ?? undefined,
    taxAmount,
  }).total;
}
