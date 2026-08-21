/**
 * TechPartsCard — read-only parts list for the technician on a retail job.
 * Shows the vehicle's registered part numbers (and shared fitment fallbacks)
 * so the tech knows exactly what to pull from the van.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Sparkles } from "lucide-react";
import {
  fetchVehiclePartSuggestions,
  partCategoryLabel,
  type PartSuggestion,
} from "@/application/queries/vehicle-parts-registry.query";

interface TechPartsCardProps {
  vehicleId: string | null;
}

export function TechPartsCard({ vehicleId }: TechPartsCardProps) {
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState<PartSuggestion[]>([]);

  useEffect(() => {
    let active = true;
    if (!vehicleId) {
      setParts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchVehiclePartSuggestions("retail", vehicleId)
      .then((rows) => {
        if (active) setParts(rows);
      })
      .catch(() => {
        if (active) setParts([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [vehicleId]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Package className="h-4 w-4" />
          Parts To Pull
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {loading ? (
          <>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </>
        ) : parts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No part numbers on file for this vehicle yet. Confirm what you install and dispatch can
            save it to the vehicle profile.
          </p>
        ) : (
          parts.map((p, i) => (
            <div
              key={`${p.part_category}-${p.part_number}-${i}`}
              className="flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  {partCategoryLabel(p.part_category)}
                </p>
                <p className="font-mono text-sm truncate">{p.part_number}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.quantity > 1 && (
                  <Badge variant="outline" className="text-[10px]">x{p.quantity}</Badge>
                )}
                {p.source === "spec_reference" && (
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Sparkles className="h-3 w-3" /> suggested
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
