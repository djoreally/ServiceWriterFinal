import { useEffect, useState } from "react";
import { CircleDot, Droplet, Sparkles } from "lucide-react";
import { fetchAppointmentBookingConfiguration } from "@/application/queries/booking-configuration.query";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";

export function AppointmentConfigurationSummary({
  appointmentId,
}: {
  appointmentId: string;
}) {
  const [configuration, setConfiguration] =
    useState<AppointmentBookingConfiguration | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAppointmentBookingConfiguration(appointmentId).then((nextConfiguration) => {
      if (active) setConfiguration(nextConfiguration);
    }).catch(() => {
      if (active) setConfiguration(null);
    });
    return () => {
      active = false;
    };
  }, [appointmentId]);

  if (!configuration?.vehicles.length) return null;

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <p className="mb-3 text-sm font-semibold">Service configuration</p>
      <div className="space-y-3">
        {configuration.vehicles.map((vehicle) => (
          <div key={vehicle.clientVehicleId} className="text-sm">
            <p className="font-medium">
              {vehicle.vehicle.year} {vehicle.vehicle.make} {vehicle.vehicle.model}
            </p>
            {vehicle.oil && (
              <div className="mt-1 flex items-start gap-2 text-muted-foreground">
                <Droplet className="mt-0.5 h-4 w-4" />
                <span>
                  {vehicle.oil.engine ? `Engine ${vehicle.oil.engine}` : "Oil service"}
                  {vehicle.oil.oilType ? ` · ${vehicle.oil.oilType}` : ""}
                  {vehicle.oil.oilCapacity ? ` · ${vehicle.oil.oilCapacity}` : ""}
                  {vehicle.oil.capacitySource
                    ? ` · ${vehicle.oil.capacitySource.toUpperCase()} source`
                    : ""}
                </span>
              </div>
            )}
            {vehicle.tire && (
              <div className="mt-1 flex items-start gap-2 text-muted-foreground">
                <CircleDot className="mt-0.5 h-4 w-4" />
                <span>
                  Front {vehicle.tire.frontSize} × {vehicle.tire.frontQuantity}
                  {vehicle.tire.rearSize
                    ? ` · Rear ${vehicle.tire.rearSize} × ${vehicle.tire.rearQuantity}`
                    : ""}
                  {vehicle.tire.productName
                    ? ` · ${vehicle.tire.productName}${vehicle.tire.sku ? ` (${vehicle.tire.sku})` : ""}`
                    : ""}
                  {vehicle.tire.options.mountAndBalance ? " · Mount & balance" : ""}
                  {vehicle.tire.options.tpms ? " · TPMS" : ""}
                  {vehicle.tire.options.disposal ? " · Disposal" : ""}
                </span>
              </div>
            )}
            {vehicle.detailing && (
              <div className="mt-1 flex items-start gap-2 text-muted-foreground">
                <Sparkles className="mt-0.5 h-4 w-4" />
                <span>
                  {vehicle.detailing.vehicleSize} vehicle · {vehicle.detailing.condition} condition
                  <br />
                  Mobile access {vehicle.detailing.site.mobileAccessConfirmed ? "confirmed" : "not confirmed"}
                  {" · "}Water {vehicle.detailing.site.waterAvailable ? "yes" : "no"}
                  {" · "}Power {vehicle.detailing.site.powerAvailable ? "yes" : "no"}
                  {" · "}{vehicle.detailing.photos.length} photo(s)
                  {vehicle.detailing.petHair ? " · Pet hair" : ""}
                  {vehicle.detailing.biohazard ? " · Contamination disclosed" : ""}
                  {vehicle.detailing.quoteRequired ? " · Quote required" : " · Starting estimate"}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
