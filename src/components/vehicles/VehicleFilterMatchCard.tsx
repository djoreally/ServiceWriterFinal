/**
 * VehicleFilterMatchCard — one presentational surface for resolved filter matches.
 * Shows the part number per category, where the match came from, substitutes, and
 * (optionally) lets the shop confirm the match onto the vehicle record.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Filter } from "lucide-react";
import {
  FILTER_SOURCE_LABELS,
  filterCategoryLabel,
  useVehicleFilters,
  type ResolvedVehicleFilter,
  type VehicleFilterLookup,
} from "@/application/queries/vehicle-filters.query";
import { addVehiclePart } from "@/application/commands/vehicle-parts-registry.command";

interface VehicleFilterMatchCardProps extends VehicleFilterLookup {
  /** Restrict to specific categories, e.g. ["oil_filter", "cabin_filter"]. */
  categories?: string[];
  /** Show the "Confirm for this vehicle" action (needs vehicleKind + vehicleId). */
  allowConfirm?: boolean;
  title?: string;
  className?: string;
  /** Category policy gate — when false, oil/fluid filter rows are suppressed. */
  showFluidSpecs?: boolean;
}

const FLUID_CATEGORIES = ["oil_filter", "oil", "fuel_filter", "transmission", "hydraulic", "pcv", "breather"];

function sourceVariant(source: ResolvedVehicleFilter["source"]) {
  if (source === "shop_confirmed") return "default" as const;
  if (source === "fram_catalogue") return "secondary" as const;
  return "outline" as const;
}

export function VehicleFilterMatchCard({
  categories,
  allowConfirm = false,
  title = "Filter match",
  className,
  showFluidSpecs = true,
  ...lookup
}: VehicleFilterMatchCardProps) {
  const { data, isLoading, isError } = useVehicleFilters(lookup);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string[]>([]);

  const rows = (data ?? []).filter(
    (row) =>
      (!categories || categories.includes(row.part_category)) &&
      (showFluidSpecs || !FLUID_CATEGORIES.includes(row.part_category)),
  );


  const canConfirm = allowConfirm && !!lookup.vehicleKind && !!lookup.vehicleId;

  async function confirm(row: ResolvedVehicleFilter) {
    if (!lookup.vehicleKind || !lookup.vehicleId) return;
    setConfirming(row.part_category);
    try {
      await addVehiclePart(lookup.vehicleKind, lookup.vehicleId, {
        part_category: row.part_category,
        part_number: row.part_number,
        brand: row.brand,
        oem_number: row.oem_number,
        quantity: row.quantity,
        notes: `Confirmed from ${FILTER_SOURCE_LABELS[row.source]}`,
      });
      setConfirmed((prev) => [...prev, row.part_category]);
      toast.success(`${row.part_number} confirmed for this vehicle`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm the part");
    } finally {
      setConfirming(null);
    }
  }

  if (!lookup.year || !lookup.make || !lookup.model) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {title}
          {!isLoading && !isError ? (
            rows.length > 0 ? (
              <Badge className="ml-auto gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Match resolved
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-auto gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" /> No match on file
              </Badge>
            )
          ) : null}
          {lookup.engine ? (
            <span className="text-xs font-normal text-muted-foreground">{lookup.engine}</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isError ? (
          <p className="text-sm text-muted-foreground">Filter lookup is unavailable right now.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No catalogue match for this vehicle yet — enter the part number manually.
          </p>
        ) : (
          rows.map((row) => {
            const tiers = row.substitutes.filter((s) => s.kind === "fram_tier");
            const crossRefs = row.substitutes.filter((s) => s.kind === "cross_reference");
            const isConfirmed = confirmed.includes(row.part_category) || row.source === "shop_confirmed";
            return (
              <div
                key={`${row.part_category}-${row.part_number}`}
                className="rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {filterCategoryLabel(row.part_category)}
                    </p>
                    <p className="font-mono text-lg font-semibold">
                      {row.part_number}
                      <span className="ml-2 text-sm font-sans font-medium text-muted-foreground">Qty {row.quantity}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={sourceVariant(row.source)}>
                      {FILTER_SOURCE_LABELS[row.source]}
                    </Badge>
                    {canConfirm ? (
                      isConfirmed ? (
                        <Badge variant="outline" className="gap-1">
                          <Check className="h-3 w-3" /> Confirmed
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirming === row.part_category}
                          onClick={() => confirm(row)}
                        >
                          {confirming === row.part_category ? "Saving…" : "Confirm for this vehicle"}
                        </Button>
                      )
                    ) : null}
                  </div>
                </div>

                {tiers.length > 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Upgrades:{" "}
                    {tiers.map((t) => `${t.part_number}${t.tier ? ` (${t.tier})` : ""}`).join(" · ")}
                  </p>
                ) : null}
                {crossRefs.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Substitutes:{" "}
                    {crossRefs
                      .slice(0, 6)
                      .map((s) => `${s.brand.replace(/_/g, " ")} ${s.part_number}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export default VehicleFilterMatchCard;
