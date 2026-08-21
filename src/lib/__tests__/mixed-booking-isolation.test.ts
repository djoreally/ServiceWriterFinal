import { buildAppointmentBookingConfiguration } from "../booking-configuration";
import { resolveCategoryPolicy } from "../service-category-policy";

describe("mixed oil and tire multi-vehicle booking", () => {
  const oilService = {
    id: "oil-service",
    name: "Full Synthetic Oil Change",
    description: null,
    default_price: 89,
    estimated_duration: 45,
    category: "Oil Change",
    booking_requirements: ["oil_fitment" as const],
  };
  const tireService = {
    id: "tire-service",
    name: "Tire Installation",
    description: null,
    default_price: 120,
    estimated_duration: 60,
    category: "Tires",
    booking_requirements: ["tire_fitment" as const, "tire_quantity" as const],
  };

  it("keeps service assignments and vehicle configuration isolated", () => {
    const vehicles = [
      {
        id: "vehicle-1",
        year: "2021",
        make: "Toyota",
        model: "Camry",
        engine: "2.5L",
        oilType: "0W-20",
        oilCapacity: "5.0 qt",
        oilCapacitySource: "db" as const,
      },
      {
        id: "vehicle-2",
        year: "2022",
        make: "Honda",
        model: "Civic",
        tireSize: "235/40R19",
        tireSizeSource: "oe" as const,
        tireFrontQuantity: 4,
        tireRearQuantity: 0,
        tireInventoryItemId: "tire-inventory-2",
        tireInventorySku: "TIRE-235-40R19",
        tireInventoryName: "Performance Tire",
        tireUnitPrice: 210,
        tireMountAndBalance: true,
        tireTpms: false,
        tireDisposal: true,
      },
    ];

    const selections = {
      "vehicle-1": { services: [oilService], package: null },
      "vehicle-2": { services: [tireService], package: null },
    };

    const configuration = buildAppointmentBookingConfiguration(vehicles, selections);
    expect(configuration.vehicles[0]).toMatchObject({
      clientVehicleId: "vehicle-1",
      oil: { oilType: "0W-20", oilCapacity: "5.0 qt" },
    });
    expect(configuration.vehicles[0].tire).toBeUndefined();
    expect(configuration.vehicles[0].services).toEqual([
      { id: "oil-service", name: "Full Synthetic Oil Change", price: 89, quantity: 1 },
    ]);

    expect(configuration.vehicles[1]).toMatchObject({
      clientVehicleId: "vehicle-2",
      tire: {
        frontSize: "235/40R19",
        frontQuantity: 4,
        rearQuantity: 0,
        inventoryItemId: "tire-inventory-2",
        sku: "TIRE-235-40R19",
      },
    });
    expect(configuration.vehicles[1].oil).toBeUndefined();
    expect(configuration.vehicles[1].services).toEqual([
      { id: "tire-service", name: "Tire Installation", price: 120, quantity: 1 },
    ]);
  });

  it("resolves oil and tire category policies independently", () => {
    const rows = [
      { id: "oil", name: "Oil Change", parent_id: null, vehicle_selector: "ymm_engine" as const, shows_fluid_specs: true, booking_requirements: ["oil_fitment" as const] },
      { id: "tires", name: "Tires", parent_id: null, vehicle_selector: "wheel_tire" as const, shows_fluid_specs: false, booking_requirements: ["tire_fitment" as const, "tire_quantity" as const] },
    ];

    expect(resolveCategoryPolicy(rows, ["Oil Change"])).toMatchObject({ showsFluidSpecs: true, vehicleSelector: "ymm_engine", requirements: ["oil_fitment"] });
    expect(resolveCategoryPolicy(rows, ["Tires"])).toMatchObject({ showsFluidSpecs: false, vehicleSelector: "wheel_tire", requirements: ["tire_fitment", "tire_quantity"] });
  });
});
