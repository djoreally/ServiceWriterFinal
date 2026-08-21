import { fleetInvoicesToCsv, invoiceAgingBucket, summarizeFleetInvoiceOperations } from "../fleet-invoice-operations";
import type { FleetInvoiceRow } from "@/application/queries/fleet-invoices.query";

const invoice = (overrides: Partial<FleetInvoiceRow> = {}): FleetInvoiceRow => ({
  id: "inv-1", invoice_number: "INV-1", fleet_client_id: "client-1", status: "sent",
  issue_date: "2026-01-01", due_date: "2026-01-15", total: 100, amount_paid: 25,
  sent_at: null, delivery_status: "sent", delivery_last_error: null, delivery_attempt_count: 1,
  created_at: "2026-01-01T00:00:00Z", fleet_clients: { company_name: "Fleet, Inc." }, ...overrides,
});

describe("fleet invoice operations", () => {
  it("calculates aging and operational backlog metrics from balances", () => {
    const rows = [
      invoice(),
      invoice({ id: "inv-2", status: "draft", due_date: "2026-03-01", total: 50, amount_paid: 0, delivery_status: "failed" }),
      invoice({ id: "inv-3", status: "paid", total: 80, amount_paid: 80 }),
    ];
    const summary = summarizeFleetInvoiceOperations(rows, new Date("2026-04-20T00:00:00Z"));
    expect(summary).toMatchObject({ draftCount: 1, overdueCount: 2, failedDeliveryCount: 1, outstanding: 125 });
    expect(invoiceAgingBucket(rows[0], new Date("2026-04-20T00:00:00Z"))).toBe("90+");
  });

  it("exports escaped document-level AR data", () => {
    const csv = fleetInvoicesToCsv([invoice()]);
    expect(csv).toContain('"Fleet, Inc."');
    expect(csv).toContain('"75"');
    expect(csv.split("\n")).toHaveLength(2);
  });
});
