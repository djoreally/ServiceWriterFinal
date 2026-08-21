import { deriveFleetClientReadiness } from "../fleet-client-detail.query";

describe("fleet client readiness", () => {
  it("requires complete vehicle, contact, and location data for service readiness", () => {
    const result = deriveFleetClientReadiness({ contacts: 1, locations: 1, contracts: 1, purchaseOrders: 1, vehicles: 20, incompleteVehicles: 2 });
    expect(result.readyForService).toBe(false);
    expect(result.blockers.map((item) => item.key)).toContain("vehicle_data");
  });

  it("requires both a contract and PO for automated invoices", () => {
    const result = deriveFleetClientReadiness({ contacts: 1, locations: 1, contracts: 0, purchaseOrders: 0, vehicles: 20, incompleteVehicles: 0 });
    expect(result.readyForService).toBe(true);
    expect(result.readyForAutomatedInvoices).toBe(false);
    expect(result.blockers.map((item) => item.key)).toEqual(expect.arrayContaining(["contracts", "pos"]));
  });

  it("marks a fully configured fleet client ready", () => {
    const result = deriveFleetClientReadiness({ contacts: 2, locations: 1, contracts: 1, purchaseOrders: 1, vehicles: 20, incompleteVehicles: 0 });
    expect(result.readyForAutomatedInvoices).toBe(true);
    expect(result.blockers).toEqual([]);
  });
});
