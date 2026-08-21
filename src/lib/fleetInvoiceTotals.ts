import { bankersRound } from "@/lib/financialMath";

export type ProcessingFeeType = "percentage" | "fixed";

export interface FleetInvoiceTotalOptions {
  taxEnabled: boolean;
  taxRate: number;
  processingFeeEnabled: boolean;
  processingFeeType: ProcessingFeeType;
  processingFeeValue: number;
}

export function calculateFleetInvoiceTotals(subtotal: number, options: FleetInvoiceTotalOptions) {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);
  const feeValue = Math.max(0, Number(options.processingFeeValue) || 0);
  const processingFee = options.processingFeeEnabled
    ? options.processingFeeType === "percentage"
      ? bankersRound(safeSubtotal * feeValue / 100, 2)
      : bankersRound(feeValue, 2)
    : 0;
  const invoiceSubtotal = bankersRound(safeSubtotal + processingFee, 2);
  const taxRate = Math.min(100, Math.max(0, Number(options.taxRate) || 0));
  const tax = options.taxEnabled ? bankersRound(invoiceSubtotal * taxRate / 100, 2) : 0;

  return {
    processingFee,
    tax,
    total: bankersRound(invoiceSubtotal + tax, 2),
  };
}
