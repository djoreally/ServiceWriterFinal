import type { VehicleData } from "@/components/booking/VehicleEntry";
import { hasValidRequestedTireQuantity } from "@/lib/tire-quantity";

export const BOOKING_CONFIGURATION_VERSION = 2 as const;

export interface BookingVehicleConfiguration {
  clientVehicleId: string;
  vehicle: { year: string; make: string; model: string; vin?: string; licensePlate?: string };
  services?: Array<{ id: string; name: string; price: number; quantity: number }>;
  package?: { id: string; name: string; price: number };
  oil?: {
    engine?: string;
    oilType?: string;
    oilCapacity?: string;
    capacitySource?: "db" | "ai" | "manual";
  };
  tire?: {
    frontSize: string;
    rearSize?: string;
    source: "oe" | "manual";
    frontQuantity: number;
    rearQuantity: number;
    inventoryItemId?: string;
    sku?: string;
    productName?: string;
    unitPrice?: number;
    options: { mountAndBalance: boolean; tpms: boolean; disposal: boolean };
  };
  detailing?: { vehicleSize: "compact" | "midsize" | "large" | "oversize"; condition: "light" | "moderate" | "heavy"; site:{mobileAccessConfirmed:boolean;waterAvailable:boolean;powerAvailable:boolean;coveredAreaAvailable:boolean}; petHair:boolean; biohazard:boolean; photos:string[]; photoRequired:boolean; quoteRequired:boolean; pricingSnapshot:{priceMultiplier:number;durationMultiplier:number;flatFee:number} };
}

export interface AppointmentBookingConfiguration {
  schemaVersion: typeof BOOKING_CONFIGURATION_VERSION;
  capturedAt: string;
  vehicles: BookingVehicleConfiguration[];
}

function buildTireConfiguration(vehicle: VehicleData): NonNullable<BookingVehicleConfiguration["tire"]> {
  if (!vehicle.tireSize) throw new Error("Tire fitment is required before building tire configuration");
  const hasExplicitQuantity = hasValidRequestedTireQuantity(vehicle);
  if (vehicle.tireInventoryItemId && !hasExplicitQuantity) {
    throw new Error("Tire quantity must be explicitly selected before reserving inventory");
  }

  return {
    frontSize: vehicle.tireSize,
    rearSize: vehicle.rearTireSize || undefined,
    source: vehicle.tireSizeSource || "manual",
    frontQuantity: hasExplicitQuantity ? vehicle.tireFrontQuantity! : 0,
    rearQuantity: hasExplicitQuantity && vehicle.rearTireSize ? vehicle.tireRearQuantity! : 0,
    inventoryItemId: vehicle.tireInventoryItemId,
    sku: vehicle.tireInventorySku,
    productName: vehicle.tireInventoryName,
    unitPrice: vehicle.tireUnitPrice,
    options: {
      mountAndBalance: vehicle.tireMountAndBalance ?? true,
      tpms: vehicle.tireTpms ?? false,
      disposal: vehicle.tireDisposal ?? true,
    },
  };
}

export function buildAppointmentBookingConfiguration(vehicles: VehicleData[], vehicleServiceSelections: Record<string, { services: Array<{ id: string; name: string; default_price: number }>; package: { id: string; name: string; package_price: number; services: Array<{ id: string; name: string; price: number; quantity: number }> } | null }> = {}): AppointmentBookingConfiguration {
  return {
    schemaVersion: BOOKING_CONFIGURATION_VERSION,
    capturedAt: new Date().toISOString(),
    vehicles: vehicles.filter((v) => v.year && v.make && v.model).map((v) => ({
      clientVehicleId: v.id,
      vehicle: { year: v.year, make: v.make, model: v.model, vin: v.vin || undefined, licensePlate: v.licensePlate || undefined },
      ...(vehicleServiceSelections[v.id]?.services?.length ? { services: vehicleServiceSelections[v.id].services.map((service) => ({ id: service.id, name: service.name, price: service.default_price, quantity: 1 })) } : {}),
      ...(vehicleServiceSelections[v.id]?.package ? { package: { id: vehicleServiceSelections[v.id]!.package!.id, name: vehicleServiceSelections[v.id]!.package!.name, price: vehicleServiceSelections[v.id]!.package!.package_price } } : {}),
      ...(v.engine || v.oilType || v.oilCapacity ? { oil: {
        engine: v.engine || undefined,
        oilType: v.oilType || undefined,
        oilCapacity: v.oilCapacity || undefined,
        capacitySource: v.oilCapacitySource,
      } } : {}),
      ...(v.tireSize ? { tire: buildTireConfiguration(v) } : {}),
      ...(v.detailingVehicleSize && v.detailingCondition ? { detailing: { vehicleSize: v.detailingVehicleSize, condition: v.detailingCondition,site:{mobileAccessConfirmed:v.detailingMobileAccessConfirmed===true,waterAvailable:v.detailingHasWater===true,powerAvailable:v.detailingHasPower===true,coveredAreaAvailable:v.detailingHasCoveredArea===true},petHair:v.detailingPetHair===true,biohazard:v.detailingBiohazard===true,photos:v.detailingPhotos||[],photoRequired:v.detailingPhotoRequired===true,quoteRequired:v.detailingQuoteRequired===true,pricingSnapshot:{priceMultiplier:v.detailingPriceMultiplier||1,durationMultiplier:v.detailingDurationMultiplier||1,flatFee:v.detailingFlatFee||0} } } : {}),
    })),
  };
}

export function configurationInventoryTotal(configuration: AppointmentBookingConfiguration): number {
  return configuration.vehicles.reduce((sum, vehicle) => {
    if (!vehicle.tire?.unitPrice) return sum;
    return sum + vehicle.tire.unitPrice * (vehicle.tire.frontQuantity + vehicle.tire.rearQuantity);
  }, 0);
}
