import { useEffect, useState } from "react";
import { Car } from "lucide-react";
import { fetchAppointmentBookingConfiguration } from "@/application/queries/booking-configuration.query";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";
import { VehicleSpecBlock } from "@/components/appointments/VehicleSpecBlock";

/**
 * Vehicles & working specs for an appointment — B4's booking-configuration
 * response rendered flat (redesign: no nested cards). Every vehicle gets a
 * VehicleSpecBlock with its merged working spec, specStatus state chip, and
 * per-field provenance. Specs come from the server merge ONLY (learned →
 * catalog → snapshot); the retired client-side VIN decode invented a fourth
 * source and is gone.
 */
export function AppointmentConfigurationSummary({ appointmentId }: { appointmentId: string }) {
  const [configuration, setConfiguration] = useState<AppointmentBookingConfiguration | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAppointmentBookingConfiguration(appointmentId)
      .then((nextConfiguration) => {
        if (active) setConfiguration(nextConfiguration);
      })
      .catch(() => {
        if (active) setConfiguration(null);
      });
    return () => {
      active = false;
    };
  }, [appointmentId]);

  if (!configuration?.vehicles.length) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="mb-2 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Car className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-display font-bold">Vehicles & working specs</p>
          <p className="text-xs text-muted-foreground">
            {configuration.vehicles.length === 1
              ? "One vehicle on this job"
              : `${configuration.vehicles.length} vehicles on this job`}
          </p>
        </div>
      </div>

      <div>
        {configuration.vehicles.map((vehicle) => (
          <VehicleSpecBlock key={vehicle.clientVehicleId} vehicle={vehicle} />
        ))}
      </div>
    </div>
  );
}
