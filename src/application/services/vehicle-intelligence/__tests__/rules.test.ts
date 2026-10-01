import { evaluateVehicleIntelligence } from "@/application/services/vehicle-intelligence/rules";
import type { VehicleIntelligenceInput } from "@/application/services/vehicle-intelligence/types";

function input(overrides: Partial<VehicleIntelligenceInput> = {}): VehicleIntelligenceInput {
  return {
    vehicleId: "v-1",
    userId: "u-1",
    year: 2020,
    make: "Toyota",
    model: "Camry",
    fuelTypePrimary: "Gasoline",
    vehicleType: "Sedan",
    engineCylinders: 4,
    displacementLiters: 2.5,
    ...overrides,
  };
}

describe("vehicle-intelligence rules", () => {
  describe("service class derivation", () => {
    it("classifies EVs first (fuel wins over everything)", () => {
      const result = evaluateVehicleIntelligence(
        input({ fuelTypePrimary: "Electric", make: "BMW" }),
      );
      expect(result.serviceClass).toBe("ev");
    });

    it("classifies diesels by fuel type", () => {
      expect(
        evaluateVehicleIntelligence(input({ fuelTypePrimary: "Diesel" })).serviceClass,
      ).toBe("diesel");
    });

    it("classifies vans and cargo vehicles by type", () => {
      expect(
        evaluateVehicleIntelligence(input({ vehicleType: "Cargo Van" })).serviceClass,
      ).toBe("van");
    });

    it("classifies European makes", () => {
      for (const make of ["BMW", "audi", " Mercedes-Benz "]) {
        expect(evaluateVehicleIntelligence(input({ make })).serviceClass).toBe("euro");
      }
    });

    it("classifies trucks and V8+ engines as heavy duty", () => {
      expect(
        evaluateVehicleIntelligence(input({ vehicleType: "Pickup Truck" })).serviceClass,
      ).toBe("heavy_duty");
      expect(evaluateVehicleIntelligence(input({ engineCylinders: 8 })).serviceClass).toBe(
        "heavy_duty",
      );
    });

    it("defaults everything else to light duty", () => {
      expect(evaluateVehicleIntelligence(input()).serviceClass).toBe("light_duty");
    });
  });

  describe("oil spec derivation", () => {
    it("maps each service class to its spec", () => {
      const cases: Array<[Partial<VehicleIntelligenceInput>, string]> = [
        [{}, "5W-20 Full Synthetic"],
        [{ fuelTypePrimary: "Diesel" }, "5W-40 Diesel Synthetic"],
        [{ make: "BMW" }, "0W-40 Euro Synthetic"],
        [{ engineCylinders: 8 }, "15W-40 HD"],
        [{ vehicleType: "Cargo Van" }, "5W-30 Fleet Synthetic Blend"],
        [{ fuelTypePrimary: "Electric" }, "N/A - EV"],
      ];
      for (const [overrides, spec] of cases) {
        expect(evaluateVehicleIntelligence(input(overrides)).oilSpecification).toBe(spec);
      }
    });
  });

  describe("oil capacity derivation", () => {
    it("returns 0 for EVs", () => {
      expect(
        evaluateVehicleIntelligence(input({ fuelTypePrimary: "Electric" }))
          .estimatedOilCapacityQuarts,
      ).toBe(0);
    });

    it("estimates from displacement and clamps to 4–13 quarts", () => {
      expect(
        evaluateVehicleIntelligence(input({ displacementLiters: 2.5 }))
          .estimatedOilCapacityQuarts,
      ).toBe(4.5); // 2.5 * 1.2 + 1.5
      expect(
        evaluateVehicleIntelligence(input({ displacementLiters: 20 }))
          .estimatedOilCapacityQuarts,
      ).toBe(13);
      expect(
        evaluateVehicleIntelligence(input({ displacementLiters: 1 }))
          .estimatedOilCapacityQuarts,
      ).toBe(4);
    });

    it("falls back to cylinder count when displacement is unknown", () => {
      expect(
        evaluateVehicleIntelligence(
          input({ displacementLiters: null, engineCylinders: 8 }),
        ).estimatedOilCapacityQuarts,
      ).toBe(8);
      expect(
        evaluateVehicleIntelligence(
          input({ displacementLiters: null, engineCylinders: 6 }),
        ).estimatedOilCapacityQuarts,
      ).toBe(6);
      expect(
        evaluateVehicleIntelligence(
          input({ displacementLiters: null, engineCylinders: 4 }),
        ).estimatedOilCapacityQuarts,
      ).toBe(5);
    });
  });

  describe("maintenance profile", () => {
    it("gives diesels and heavy-duty severe service intervals", () => {
      const diesel = evaluateVehicleIntelligence(input({ fuelTypePrimary: "Diesel" }));
      expect(diesel.maintenanceProfile).toMatchObject({
        oilChangeMiles: 7500,
        severity: "severe",
      });
    });

    it("gives EVs inspection-only intervals", () => {
      const ev = evaluateVehicleIntelligence(input({ fuelTypePrimary: "Electric" }));
      expect(ev.maintenanceProfile.oilChangeMiles).toBe(0);
      expect(ev.maintenanceProfile.inspectionMiles).toBe(7500);
      expect(ev.oilFilterCategory).toBe("none");
    });

    it("gives euros extended normal intervals", () => {
      const euro = evaluateVehicleIntelligence(input({ make: "Porsche" }));
      expect(euro.maintenanceProfile).toMatchObject({
        oilChangeMiles: 10000,
        oilChangeMonths: 12,
        severity: "normal",
      });
      expect(euro.oilFilterCategory).toBe("cartridge euro-spec");
    });
  });
});
