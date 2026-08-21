/**
 * VehicleStep - Step 2: Vehicle Details
 * Handles multi-vehicle entry with VIN/mileage support
 */

import { Car, CircleDot } from "lucide-react";
import { VehicleEntry, VehicleData } from "@/components/booking/VehicleEntry";
import type { BookingRequirement, VehicleSelectorKind } from "@/lib/service-category-policy";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";

interface VehicleStepProps {
  vehicles: VehicleData[];
  onVehiclesChange: (vehicles: VehicleData[]) => void;
  vehicleSelector?: VehicleSelectorKind;
  showFluidSpecs?: boolean;
  bookingRequirements?: BookingRequirement[];
  businessUserId?: string;
  detailingRules?: DetailingPricingRule[];
}

export function VehicleStep({
  vehicles,
  onVehiclesChange,
  vehicleSelector = "ymm_engine",
  showFluidSpecs = true,
  bookingRequirements,
  businessUserId,
  detailingRules,
}: VehicleStepProps) {
  const isTireFlow = bookingRequirements?.includes("tire_fitment") ?? vehicleSelector === "wheel_tire";

  return (
    <div className="max-w-2xl mx-auto rounded-3xl bg-gradient-to-b from-slate-50 to-white p-4 sm:p-6">
      <div className="text-left mb-5">
        {isTireFlow ? (
          <CircleDot className="h-10 w-10 text-primary mb-3" />
        ) : (
          <Car className="h-10 w-10 text-primary mb-3" />
        )}
        <h2 className="text-2xl font-bold mb-2">Tell us about your vehicle(s)</h2>
        <p className="text-muted-foreground">
          {isTireFlow
            ? "We'll confirm your factory tire size — you can override it if your tires are different"
            : "Add one or more vehicles for service"}
        </p>
      </div>

      {vehicles.some((vehicle) => vehicle.year && vehicle.make && vehicle.model) && (
        <div className="mb-4 flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-white text-blue-700 shadow-sm"><Car className="h-8 w-8" /></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Vehicle ready</p><p className="font-bold">{vehicles.find((vehicle) => vehicle.year && vehicle.make && vehicle.model)?.year} {vehicles.find((vehicle) => vehicle.year && vehicle.make && vehicle.model)?.make} {vehicles.find((vehicle) => vehicle.year && vehicle.make && vehicle.model)?.model}</p></div>
        </div>
      )}

      <VehicleEntry
        vehicles={vehicles}
        onVehiclesChange={onVehiclesChange}
        vehicleSelector={vehicleSelector}
        showFluidSpecs={showFluidSpecs}
        bookingRequirements={bookingRequirements}
        businessUserId={businessUserId}
        detailingRules={detailingRules}
      />
    </div>
  );
}
