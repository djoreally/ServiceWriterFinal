import { evaluateFleetInvoiceCompliance, isFleetInvoiceCadenceDue } from "../fleet-invoice-compliance";
import type { DispatcherFleetWorkOrder } from "@/application/queries/dispatcher-work-orders.query";

const order = (overrides: Partial<DispatcherFleetWorkOrder> = {}): DispatcherFleetWorkOrder => ({
  id: "wo-1", order_number: "WO-1", status: "completed", total: 100 as never,
  scheduled_date: null, completed_at: "2026-07-01T00:00:00Z", po_number: "PO-1",
  fleet_client_id: "client-1", fleet_contract_id: "contract-1",
  fleet_clients: { company_name: "Fleet", payment_terms: "net_45", tax_exempt: true, billing_email: "billing@example.com", ap_contact_email: null },
  fleet_contracts: { name: "Main", invoice_frequency: "weekly", pricing_rules: { billing: { invoice_group: "North", invoice_frequency: "weekly", net_terms: "net_45" }, po: { requires_po: true } } },
  fleet_vehicles: null,
  ...overrides,
});

describe("fleet invoice contract compliance", () => {
  it("derives billing context and tax exemption from contract and client", () => {
    const result = evaluateFleetInvoiceCompliance([order()], new Date("2026-07-30T00:00:00Z"));
    expect(result).toMatchObject({ errors: [], invoiceGroup: "North", invoiceFrequency: "weekly", paymentTerms: "net_45", recipientEmail: "billing@example.com", taxExempt: true, due: true });
    expect(result.warnings).toContain("This client is tax exempt; sales tax will not be applied.");
  });

  it("blocks missing required POs and mixed invoice groups", () => {
    const second = order({ id: "wo-2", po_number: null, fleet_contracts: { name: "Other", invoice_frequency: "weekly", pricing_rules: { billing: { invoice_group: "South" }, po: { requires_po: true } } }, fleet_clients: { ...order().fleet_clients!, billing_email: null } });
    const result = evaluateFleetInvoiceCompliance([order(), second]);
    expect(result.errors).toContain("Every work order needs a purchase order number for automated invoicing.");
    expect(result.errors).toContain("Selected work orders belong to different contract invoice groups.");
  });

  it("requires a contract for automated invoices", () => {
    const result = evaluateFleetInvoiceCompliance([order({ fleet_contract_id: null, fleet_contracts: null })]);
    expect(result.errors).toContain("Every work order needs an active contract for automated invoicing.");
  });

  it("blocks clients without an invoice recipient", () => {
    const result = evaluateFleetInvoiceCompliance([order({
      fleet_clients: { ...order().fleet_clients!, billing_email: null, ap_contact_email: null },
    })]);
    expect(result.errors).toContain("The fleet client needs an AP or billing email before invoicing.");
  });

  it("calculates weekly, biweekly, and monthly due boundaries", () => {
    const now = new Date("2026-07-30T00:00:00Z");
    expect(isFleetInvoiceCadenceDue("2026-07-23T00:00:00Z", "weekly", now)).toBe(true);
    expect(isFleetInvoiceCadenceDue("2026-07-20T00:00:00Z", "biweekly", now)).toBe(false);
    expect(isFleetInvoiceCadenceDue("2026-06-30T00:00:00Z", "monthly", now)).toBe(true);
  });

  it("blocks creation before the contract cadence is due", () => {
    const result = evaluateFleetInvoiceCompliance([order({ completed_at: "2026-07-29T00:00:00Z" })], new Date("2026-07-30T00:00:00Z"));
    expect(result.due).toBe(false);
    expect(result.errors).toContain("The weekly billing cadence is not due yet.");
  });
});
