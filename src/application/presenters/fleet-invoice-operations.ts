import type { FleetInvoiceRow } from "@/application/queries/fleet-invoices.query";
import { normalizeFleetInvoiceStatus } from "./fleet-invoice-status";

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export function invoiceBalance(invoice: FleetInvoiceRow): number {
  return Math.max(0, Number(invoice.total) - Number(invoice.amount_paid || 0));
}

export function invoiceAgingBucket(invoice: FleetInvoiceRow, now = new Date()): AgingBucket {
  if (!invoice.due_date) return "current";
  const days = Math.floor((now.getTime() - new Date(`${invoice.due_date}T00:00:00Z`).getTime()) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

export function summarizeFleetInvoiceOperations(invoices: FleetInvoiceRow[], now = new Date()) {
  const collectible = invoices.filter((invoice) => !["paid", "void"].includes(normalizeFleetInvoiceStatus(invoice.status)));
  const aging: Record<AgingBucket, number> = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  collectible.forEach((invoice) => { aging[invoiceAgingBucket(invoice, now)] += invoiceBalance(invoice); });
  return {
    draftCount: invoices.filter((invoice) => normalizeFleetInvoiceStatus(invoice.status) === "draft").length,
    overdueCount: collectible.filter((invoice) => invoiceAgingBucket(invoice, now) !== "current").length,
    failedDeliveryCount: invoices.filter((invoice) => invoice.delivery_status === "failed").length,
    outstanding: collectible.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0),
    aging,
  };
}

export function fleetInvoicesToCsv(invoices: FleetInvoiceRow[]): string {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = ["Invoice", "Client", "Status", "Issue date", "Due date", "Total", "Paid", "Balance", "Delivery"];
  const rows = invoices.map((invoice) => [invoice.invoice_number, invoice.fleet_clients?.company_name, normalizeFleetInvoiceStatus(invoice.status), invoice.issue_date, invoice.due_date, invoice.total, invoice.amount_paid, invoiceBalance(invoice), invoice.delivery_status]);
  return [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}
