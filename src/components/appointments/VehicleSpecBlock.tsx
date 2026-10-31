import { AlertTriangle, CircleDot, Droplet, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusToneChip } from "@/components/appointments/StatusToneChip";
import { formatMoney } from "@/lib/financialMath";
import type { BookingVehicleConfiguration } from "@/lib/booking-configuration";
import type { SpecSource } from "@/lib/vehicle-spec-merge";
import { cn } from "@/lib/utils";

/**
 * Vehicle Spec Block (Batch 2 spec component) — one vehicle from B4's
 * booking-configuration response, rendered flat: identity, the merged
 * WORKING spec with per-field provenance, and the vehicle's own services.
 *
 * Honesty rules (T-2/T-3): a missing value is named as missing — never a
 * naked "Verify" placeholder; a needs_verification vehicle shows what IS
 * known and names what is still needed; no client-invented spec source
 * (the old NHTSA VIN-decode fallback is retired — B4's merge is the truth).
 */

const SOURCE_LABELS: Record<SpecSource, string> = {
  learned: "From service history",
  catalog: "From catalog",
  snapshot: "From booking",
};

const STATUS_CHIP = {
  verified: { label: "Verified", tone: "success" },
  from_catalog: { label: "From catalog", tone: "info" },
  needs_verification: { label: "Needs verification", tone: "warning" },
} as const;

const CORE_FIELD_LABELS = {
  oilType: "Oil",
  oilCapacity: "Capacity",
  oilFilter: "Filter",
} as const;

type CoreField = keyof typeof CORE_FIELD_LABELS;

function SpecRow({
  label,
  value,
  source,
  hero = false,
}: {
  label: string;
  value?: string;
  source?: SpecSource;
  hero?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      {value ? (
        <>
          <p className={cn("mt-0.5 font-semibold", hero && "font-display text-lg font-extrabold")}>{value}</p>
          {source && <p className="text-xs text-muted-foreground">{SOURCE_LABELS[source]}</p>}
        </>
      ) : (
        <p className="mt-0.5 font-medium text-muted-foreground">Not recorded</p>
      )}
    </div>
  );
}

export function VehicleSpecBlock({ vehicle }: { vehicle: BookingVehicleConfiguration }) {
  const oil = vehicle.oil;
  const sources = vehicle.specSources ?? {};
  const status = vehicle.specStatus;
  const missingCore: CoreField[] = (Object.keys(CORE_FIELD_LABELS) as CoreField[]).filter(
    (field) => !oil?.[field],
  );
  const showOilBlock = Boolean(oil) || Boolean(status);
  const servicesTotal = (vehicle.services ?? []).reduce((sum, s) => sum + s.price * s.quantity, 0);

  return (
    <section className="border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-display text-base font-bold">
          {vehicle.vehicle.year} {vehicle.vehicle.make} {vehicle.vehicle.model}
        </p>
        {status && (
          <StatusToneChip label={STATUS_CHIP[status].label} tone={STATUS_CHIP[status].tone} />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {vehicle.vehicle.licensePlate && (
          <Badge variant="secondary" className="font-mono text-xs">Plate {vehicle.vehicle.licensePlate}</Badge>
        )}
        {vehicle.vehicle.vin && (
          <Badge variant="outline" className="font-mono text-xs">VIN {vehicle.vehicle.vin}</Badge>
        )}
        {vehicle.vehicle.mileage != null && vehicle.vehicle.mileage > 0 && (
          <Badge variant="secondary" className="font-mono text-xs">Odometer {vehicle.vehicle.mileage.toLocaleString("en-US")} mi</Badge>
        )}
      </div>

      {(vehicle.services?.length || vehicle.package) ? (
        <div className="mt-3 space-y-1 text-sm">
          {(vehicle.services ?? []).map((service) => (
            <div key={service.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {service.name}
                {service.quantity > 1 ? <span className="text-muted-foreground"> × {service.quantity}</span> : null}
              </span>
              <span className="shrink-0 font-medium">${formatMoney(service.price * service.quantity)}</span>
            </div>
          ))}
          {vehicle.package && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{vehicle.package.name} <span className="text-muted-foreground">(package)</span></span>
              <span className="shrink-0 font-medium">${formatMoney(vehicle.package.price)}</span>
            </div>
          )}
          {servicesTotal > 0 && vehicle.services && (vehicle.services.length > 1 || vehicle.package) && (
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-semibold">
              <span>Vehicle services</span>
              <span>${formatMoney(servicesTotal + (vehicle.package?.price ?? 0))}</span>
            </div>
          )}
        </div>
      ) : null}

      {showOilBlock && (
        <div className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Droplet className="h-4 w-4 text-primary" />
            Oil service specifications
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <SpecRow label="Engine" value={oil?.engine} source={sources.engine} />
            <SpecRow label="Oil" value={oil?.oilType} source={sources.oilType} />
            <SpecRow label="Capacity" value={oil?.oilCapacity} source={sources.oilCapacity} hero />
            <SpecRow label="Filter" value={oil?.oilFilter} source={sources.oilFilter} />
          </div>
          {status === "needs_verification" && missingCore.length > 0 && (
            <p className="mt-3 flex items-start gap-1.5 text-xs font-medium text-status-inprogress-fg">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Still needed: {missingCore.map((field) => CORE_FIELD_LABELS[field].toLowerCase()).join(", ")}
            </p>
          )}
          {!oil?.engine && (
            <p className="mt-2 text-xs text-muted-foreground">Engine not recorded for this vehicle.</p>
          )}
        </div>
      )}

      {vehicle.tire && (
        <div className="mt-3 flex items-start gap-2 text-sm">
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
        <div className="mt-3 flex items-start gap-2 text-sm">
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
    </section>
  );
}
