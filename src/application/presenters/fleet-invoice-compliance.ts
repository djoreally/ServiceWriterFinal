import type { DispatcherFleetWorkOrder } from "@/application/queries/dispatcher-work-orders.query";

export interface FleetInvoiceCompliance {
  errors: string[];
  warnings: string[];
  invoiceGroup: string;
  invoiceFrequency: string;
  paymentTerms: string;
  recipientEmail: string | null;
  taxExempt: boolean;
  due: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function isFleetInvoiceCadenceDue(
  completedAt: string | null,
  frequency: string,
  now = new Date(),
): boolean {
  if (frequency === "per_service") return true;
  if (!completedAt) return false;
  const completed = new Date(completedAt);
  const ageDays = (now.getTime() - completed.getTime()) / 86_400_000;
  if (frequency === "weekly") return ageDays >= 7;
  if (frequency === "biweekly") return ageDays >= 14;
  if (frequency === "monthly") {
    return completed.getUTCFullYear() < now.getUTCFullYear() || completed.getUTCMonth() < now.getUTCMonth();
  }
  return true;
}

export function evaluateFleetInvoiceCompliance(
  orders: DispatcherFleetWorkOrder[],
  now = new Date(),
): FleetInvoiceCompliance {
  const errors: string[] = [];
  const warnings: string[] = [];
  const first = orders[0];
  const client = first?.fleet_clients;
  const rules = record(first?.fleet_contracts?.pricing_rules);
  const billing = record(rules.billing);
  const invoiceGroup = String(billing.invoice_group || first?.fleet_contracts?.name || "Ungrouped");
  const invoiceFrequency = String(billing.invoice_frequency || first?.fleet_contracts?.invoice_frequency || "per_service");
  const paymentTerms = String(billing.net_terms || client?.payment_terms || "net_30");
  const recipientEmail = client?.ap_contact_email || client?.billing_email || null;
  const taxExempt = Boolean(client?.tax_exempt);
  if (!orders.length) errors.push("Select at least one completed work order.");
  if (!recipientEmail) errors.push("The fleet client needs an AP or billing email before invoicing.");
  if (orders.some((order) => !order.fleet_contract_id)) errors.push("Every work order needs an active contract for automated invoicing.");
  if (orders.some((order) => !order.po_number?.trim())) errors.push("Every work order needs a purchase order number for automated invoicing.");
  if (new Set(orders.map((order) => order.fleet_client_id)).size > 1) errors.push("Invoice groups cannot span fleet clients.");
  const groups = new Set(orders.map((order) => {
    const orderRules = record(order.fleet_contracts?.pricing_rules);
    return String(record(orderRules.billing).invoice_group || order.fleet_contracts?.name || "Ungrouped");
  }));
  if (groups.size > 1) errors.push("Selected work orders belong to different contract invoice groups.");
  const frequencies = new Set(orders.map((order) => {
    const orderRules = record(order.fleet_contracts?.pricing_rules);
    return String(record(orderRules.billing).invoice_frequency || order.fleet_contracts?.invoice_frequency || "per_service");
  }));
  if (frequencies.size > 1) errors.push("Selected work orders use different billing cadences.");

  const due = orders.every((order) => isFleetInvoiceCadenceDue(order.completed_at, invoiceFrequency, now));
  if (!due) errors.push(`The ${invoiceFrequency.replace("_", " ")} billing cadence is not due yet.`);
  if (taxExempt) warnings.push("This client is tax exempt; sales tax will not be applied.");

  return { errors, warnings, invoiceGroup, invoiceFrequency, paymentTerms, recipientEmail, taxExempt, due };
}
