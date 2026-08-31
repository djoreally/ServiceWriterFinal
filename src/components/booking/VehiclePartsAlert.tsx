/** Per-vehicle filter status shown in the booking flow. */
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import {
  resolveBookingFilterMatch,
  type VehicleFilterMatch,
} from "@/lib/bookingFilterMatch";
import { filterCategoryLabel } from "@/application/queries/vehicle-filters.query";

interface VehiclePartsAlertProps {
  vehicles: VehicleData[];
  serviceNames: string[];
  requiredFilterTypes?: string[];
}

export function VehiclePartsAlert({ vehicles, serviceNames }: VehiclePartsAlertProps) {
  const [matches, setMatches] = useState<VehicleFilterMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const completeVehicles = useMemo(
    () => vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model),
    [vehicles],
  );
  const lookupKey = JSON.stringify(
    completeVehicles.map(({ id, year, make, model, engine, vin }) => ({ id, year, make, model, engine, vin })),
  );
  const serviceKey = serviceNames.join("|");
  const vehicleCount = completeVehicles.length;
  const serviceCount = serviceNames.length;

  useEffect(() => {
    let active = true;
    if (vehicleCount === 0 || serviceCount === 0) {
      void Promise.resolve().then(() => setMatches([]));
      return () => { active = false; };
    }
    void Promise.resolve().then(() => setLoading(true));
    const lookupVehicles = JSON.parse(lookupKey) as VehicleData[];
    const lookupServices = serviceKey.split("|").filter(Boolean);
    void Promise.resolve().then(() => resolveBookingFilterMatch({ vehicles: lookupVehicles, serviceNames: lookupServices })
      .then((result) => { if (active) setMatches(result); })
      .finally(() => { if (active) setLoading(false); }));
    return () => { active = false; };
  // Stable serialized keys prevent a lookup loop when parent arrays are recreated.
  }, [lookupKey, serviceKey, vehicleCount, serviceCount]);

  if (completeVehicles.length === 0 || serviceNames.length === 0) return null;
  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Resolving filter matches…</div>;
  }

  return (
    <div className="space-y-3" aria-label="Filter match status by vehicle">
      {matches.map((match, index) => {
        const resolved = match.status === "resolved" && match.filters.length > 0;
        return (
          <Alert
            key={match.vehicleId ?? `${match.year}-${match.make}-${match.model}-${index}`}
            className={resolved ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/40"}
          >
            {resolved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Wrench className="h-4 w-4 text-muted-foreground" />}
            <AlertTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span>Vehicle {index + 1} of {matches.length}: {match.vehicleLabel}</span>
              <Badge variant="outline" className={resolved ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>
                {resolved ? "Parts confirmed" : "Parts confirmed by our team"}
              </Badge>
            </AlertTitle>
            <AlertDescription className="mt-2">
              {resolved ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {match.filters.map((filter) => (
                    <div key={`${filter.part_category}-${filter.part_number}`} className="rounded-md border bg-background/70 p-2">
                      <p className="text-xs text-muted-foreground">{filterCategoryLabel(filter.part_category)}</p>
                      <p className="font-mono text-sm font-semibold"><Wrench className="mr-1 inline h-3 w-3" />{filter.brand} {filter.part_number}</p>
                      <p className="text-xs text-muted-foreground">Quantity: {filter.quantity}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Your appointment is confirmed. Our service team will source and verify the exact parts for this vehicle before the visit.</p>
              )}
            </AlertDescription>
          </Alert>
        );
      })}
    </div>
  );
}

