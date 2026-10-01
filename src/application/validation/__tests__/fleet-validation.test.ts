import {
  validateFleetVehicle,
  validateFleetWorkOrder,
  validatePurchaseOrder,
} from "@/application/validation/fleet-validation";

describe("fleet-validation", () => {
  describe("validateFleetVehicle", () => {
    it("passes a fully-specified vehicle", () => {
      const result = validateFleetVehicle({
        fleet_client_id: "client-1",
        vin: "1HGCM82633A004352",
        license_plate: "ABC123",
        fleet_location_id: "loc-1",
        fleet_contract_id: "contract-1",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("blocks when no fleet client is selected", () => {
      const result = validateFleetVehicle({ year: 2020, make: "Ford", model: "Transit" });
      expect(result.errors).toContain("Select a fleet client for this vehicle.");
    });

    it("blocks when neither VIN nor Year+Make+Model is provided", () => {
      const result = validateFleetVehicle({ fleet_client_id: "client-1", make: "Ford" });
      expect(result.errors).toContain("Provide either VIN or Year + Make + Model.");
    });

    it("accepts Year+Make+Model without a VIN", () => {
      const result = validateFleetVehicle({
        fleet_client_id: "client-1",
        year: 2020,
        make: "Ford",
        model: "Transit",
      });
      expect(result.errors).toEqual([]);
    });

    it("warns on short VINs without blocking", () => {
      const result = validateFleetVehicle({
        fleet_client_id: "client-1",
        vin: "SHORTVIN123",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain("VIN is not 17 characters — double-check it.");
    });

    it("warns about missing completeness fields", () => {
      const result = validateFleetVehicle({
        fleet_client_id: "client-1",
        year: 2020,
        make: "Ford",
        model: "Transit",
      });
      expect(result.warnings).toContain("No license plate set.");
      expect(result.warnings).toContain(
        "No home location assigned — dispatch routing will be limited.",
      );
      expect(result.warnings).toContain("No contract linked — pricing will fall back to retail.");
    });
  });

  describe("validateFleetWorkOrder", () => {
    it("passes a fully-specified work order", () => {
      const result = validateFleetWorkOrder({
        vehicleId: "veh-1",
        vehicleClientId: "client-1",
        servicePackage: { code: "OIL" },
        scheduledDate: "2026-09-23",
        priority: "high",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("blocks when no vehicle is selected", () => {
      const result = validateFleetWorkOrder({ description: "Oil change" });
      expect(result.errors).toContain("Select a vehicle for this work order.");
    });

    it("blocks when the vehicle is not linked to a fleet client", () => {
      const result = validateFleetWorkOrder({
        vehicleId: "veh-1",
        servicePackage: { code: "OIL" },
      });
      expect(result.errors).toContain(
        "Selected vehicle is not linked to a fleet client — fix the vehicle first.",
      );
    });

    it("blocks when neither service package nor description is given", () => {
      const result = validateFleetWorkOrder({ vehicleId: "veh-1", vehicleClientId: "c-1" });
      expect(result.errors).toContain(
        "Add a service package or describe the work to be performed.",
      );
    });

    it("warns about missing schedule date and priority", () => {
      const result = validateFleetWorkOrder({
        vehicleId: "veh-1",
        vehicleClientId: "c-1",
        description: "Oil change",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain("No scheduled date — work order will sit in backlog.");
      expect(result.warnings).toContain("Priority not set — defaulting to normal.");
    });
  });

  describe("validatePurchaseOrder", () => {
    it("passes a fully-specified PO", () => {
      const result = validatePurchaseOrder({
        fleet_client_id: "client-1",
        po_number: "PO-123",
        amount_limit: 5000,
        expiry_date: "2026-12-31",
        description: "Q4 parts",
      });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it("blocks on missing client and PO number", () => {
      const result = validatePurchaseOrder({});
      expect(result.errors).toContain("Select a fleet client for this PO.");
      expect(result.errors).toContain("PO number is required.");
    });

    it("blocks negative amount limits", () => {
      const result = validatePurchaseOrder({
        fleet_client_id: "client-1",
        po_number: "PO-1",
        amount_limit: -10,
      });
      expect(result.errors).toContain("PO amount limit cannot be negative.");
    });

    it("warns about open-ended POs", () => {
      const result = validatePurchaseOrder({ fleet_client_id: "client-1", po_number: "PO-1" });
      expect(result.errors).toEqual([]);
      expect(result.warnings).toContain(
        "No spending limit set — PO will accept unlimited charges.",
      );
      expect(result.warnings).toContain("No expiry date — PO will never auto-close.");
    });
  });
});
