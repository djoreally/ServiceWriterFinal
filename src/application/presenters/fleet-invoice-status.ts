export type FleetInvoiceDisplayStatus = "draft" | "sent" | "partial" | "paid" | "void";

/** Normalize legacy/work-order status values at the UI boundary. */
export function normalizeFleetInvoiceStatus(status: string | null | undefined): FleetInvoiceDisplayStatus {
  switch (status) {
    case "sent":
      return "sent";
    case "partial":
    case "partially_paid":
      return "partial";
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "draft":
    case "pending":
    default:
      return "draft";
  }
}
