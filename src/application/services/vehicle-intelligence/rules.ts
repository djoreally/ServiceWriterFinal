import type { ServiceClass, VehicleIntelligenceDefaults, VehicleIntelligenceInput } from "./types";

const EURO_MAKES = new Set(["audi", "bmw", "mercedes-benz", "mercedes", "porsche", "volkswagen", "vw", "land rover", "jaguar", "mini"]);

function normalize(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

function deriveServiceClass(input: VehicleIntelligenceInput): ServiceClass {
  const fuel = normalize(input.fuelTypePrimary);
  const vehicleType = normalize(input.vehicleType);
  const make = normalize(input.make);

  if (fuel.includes("electric")) return "ev";
  if (fuel.includes("diesel")) return "diesel";
  if (vehicleType.includes("van") || vehicleType.includes("cargo")) return "van";
  if (EURO_MAKES.has(make)) return "euro";
  if (vehicleType.includes("truck") || (input.engineCylinders || 0) >= 8) return "heavy_duty";
  return "light_duty";
}

function deriveOilSpec(serviceClass: ServiceClass): string {
  switch (serviceClass) {
    case "diesel":
      return "5W-40 Diesel Synthetic";
    case "euro":
      return "0W-40 Euro Synthetic";
    case "heavy_duty":
      return "15W-40 HD";
    case "van":
      return "5W-30 Fleet Synthetic Blend";
    case "ev":
      return "N/A - EV";
    default:
      return "5W-20 Full Synthetic";
  }
}

function deriveOilCapacity(input: VehicleIntelligenceInput, serviceClass: ServiceClass): number {
  if (serviceClass === "ev") return 0;
  if (input.displacementLiters && input.displacementLiters > 0) {
    const estimated = Number((input.displacementLiters * 1.2 + 1.5).toFixed(1));
    return Math.max(4, Math.min(13, estimated));
  }
  if ((input.engineCylinders || 0) >= 8) return 8;
  if ((input.engineCylinders || 0) >= 6) return 6;
  return 5;
}

function deriveMaintenanceProfile(serviceClass: ServiceClass): VehicleIntelligenceDefaults["maintenanceProfile"] {
  if (serviceClass === "diesel" || serviceClass === "heavy_duty") {
    return { oilChangeMiles: 7500, oilChangeMonths: 6, inspectionMiles: 10000, inspectionMonths: 6, severity: "severe" };
  }
  if (serviceClass === "van") {
    return { oilChangeMiles: 7000, oilChangeMonths: 6, inspectionMiles: 9000, inspectionMonths: 6, severity: "severe" };
  }
  if (serviceClass === "euro") {
    return { oilChangeMiles: 10000, oilChangeMonths: 12, inspectionMiles: 10000, inspectionMonths: 12, severity: "normal" };
  }
  if (serviceClass === "ev") {
    return { oilChangeMiles: 0, oilChangeMonths: 0, inspectionMiles: 7500, inspectionMonths: 6, severity: "normal" };
  }
  return { oilChangeMiles: 5000, oilChangeMonths: 6, inspectionMiles: 7500, inspectionMonths: 6, severity: "normal" };
}

function deriveFilterCategory(serviceClass: ServiceClass): string {
  if (serviceClass === "ev") return "none";
  if (serviceClass === "diesel" || serviceClass === "heavy_duty") return "spin-on heavy-duty";
  if (serviceClass === "euro") return "cartridge euro-spec";
  if (serviceClass === "van") return "spin-on fleet";
  return "spin-on standard";
}

export function evaluateVehicleIntelligence(input: VehicleIntelligenceInput): VehicleIntelligenceDefaults {
  const serviceClass = deriveServiceClass(input);
  return {
    oilSpecification: deriveOilSpec(serviceClass),
    estimatedOilCapacityQuarts: deriveOilCapacity(input, serviceClass),
    oilFilterCategory: deriveFilterCategory(serviceClass),
    serviceClass,
    maintenanceProfile: deriveMaintenanceProfile(serviceClass),
  };
}
