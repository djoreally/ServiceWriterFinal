import { useEffect, useMemo, useState } from "react";
import { CircleDot, Droplet, Sparkles, Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fetchAppointmentBookingConfiguration } from "@/application/queries/booking-configuration.query";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";
import { decodeVin } from "@/features/vehicle-import/nhtsa.service";

export function AppointmentConfigurationSummary({ appointmentId }: { appointmentId: string }) {
  const [configuration, setConfiguration] = useState<AppointmentBookingConfiguration | null>(null);
  const [decodedEngines, setDecodedEngines] = useState<Record<string, string>>({});

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

  const vinsNeedingEngine = useMemo(() => {
    if (!configuration?.vehicles?.length) return [] as string[];
    return configuration.vehicles
      .filter((vehicle) => !vehicle.oil?.engine && vehicle.vehicle.vin)
      .map((vehicle) => vehicle.vehicle.vin as string);
  }, [configuration]);

  useEffect(() => {
    let active = true;
    if (!vinsNeedingEngine.length) return () => { active = false; };

    void Promise.all(
      vinsNeedingEngine.map(async (vin) => {
        const result = await decodeVin(vin);
        return [vin, result.profile?.engine || ""] as const;
      }),
    ).then((entries) => {
      if (!active) return;
      setDecodedEngines((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter(([, engine]) => Boolean(engine))),
      }));
    });

    return () => {
      active = false;
    };
  }, [vinsNeedingEngine]);

  if (!configuration?.vehicles.length) return null;

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Car className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Vehicle Service Specifications</p>
          <p className="text-xs text-muted-foreground">One authoritative setup for this appointment</p>
        </div>
      </div>

      <div className="space-y-4">
        {configuration.vehicles.map((vehicle) => {
          const decodedEngine = vehicle.vehicle.vin ? decodedEngines[vehicle.vehicle.vin] : undefined;
          const engine = vehicle.oil?.engine || decodedEngine;
          return (
            <div key={vehicle.clientVehicleId} className="rounded-lg border bg-muted/10 p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold">
                    {vehicle.vehicle.year} {vehicle.vehicle.make} {vehicle.vehicle.model}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {engine && <Badge variant="secondary">{engine}</Badge>}
                    {vehicle.vehicle.licensePlate && (
                      <Badge variant="secondary" className="font-mono text-xs">Plate {vehicle.vehicle.licensePlate}</Badge>
                    )}
                    {vehicle.vehicle.vin && (
                      <Badge variant="outline" className="font-mono text-xs">VIN {vehicle.vehicle.vin}</Badge>
                    )}
                  </div>
                </div>
              </div>

              {vehicle.oil && (
                <div className="mt-4 rounded-lg border bg-background/70 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                    <Droplet className="h-4 w-4 text-primary" />
                    Oil service specifications
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <Spec label="Engine" value={engine} warn={!engine} />
                    <Spec label="Oil" value={vehicle.oil.oilType} />
                    <Spec label="Capacity" value={vehicle.oil.oilCapacity} />
                    <Spec label="Filter" value={vehicle.oil.oilFilter} />
                  </div>
                  {!engine && vehicle.vehicle.vin && (
                    <p className="mt-3 text-xs text-amber-600">Engine could not be resolved from the saved appointment or VIN decode. Verify before service.</p>
                  )}
                </div>
              )}

              {vehicle.tire && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Front {vehicle.tire.frontSize} × {vehicle.tire.frontQuantity}
                    {vehicle.tire.rearSize ? ` · Rear ${vehicle.tire.rearSize} × ${vehicle.tire.rearQuantity}` : ""}
                    {vehicle.tire.productName ? ` · ${vehicle.tire.productName}${vehicle.tire.sku ? ` (${vehicle.tire.sku})` : ""}` : ""}
                    {vehicle.tire.options.mountAndBalance ? " · Mount & balance" : ""}
                    {vehicle.tire.options.tpms ? " · TPMS" : ""}
                    {vehicle.tire.options.disposal ? " · Disposal" : ""}
                  </span>
                </div>
              )}

              {vehicle.detailing && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border bg-background/70 p-3 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
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
          );
        })}
      </div>
    </div>
  );
}

function Spec({ label, value, warn = false }: { label: string; value?: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={warn ? "mt-0.5 font-medium text-amber-600" : "mt-0.5 font-medium"}>{value || "Verify"}</p>
    </div>
  );
}
