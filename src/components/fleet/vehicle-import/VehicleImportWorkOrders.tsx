import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ImportJobSetup, VehicleImportBatch, VehicleImportRow } from "@/features/vehicle-import/types";
import type { WorkOrderHandoffResult } from "@/features/vehicle-import/services/work-order-handoff.service";

interface VehicleImportWorkOrdersProps {
  batch: VehicleImportBatch;
  rows: VehicleImportRow[];
  jobSetup: ImportJobSetup | null;
  result: WorkOrderHandoffResult | null;
  loading: boolean;
  onCreate: (vehicleIds?: string[]) => void;
  onSkip: () => void;
  onOpenWorkOrders: () => void;
}

export function VehicleImportWorkOrders({
  batch,
  rows,
  jobSetup,
  result,
  loading,
  onCreate,
  onSkip,
  onOpenWorkOrders,
}: VehicleImportWorkOrdersProps) {
  const committed = rows.filter((row) => row.commitStatus === "committed" && row.existingVehicleId);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selectedIds = committed
    .map((row) => String(row.existingVehicleId))
    .filter((id) => !excluded.has(id));

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const specResolved = committed.filter((row) => row.specPayload?.status === "resolved").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Create work orders</CardTitle>
          <CardDescription>
            {committed.length} vehicles imported for {jobSetup?.fleetClientName || "this client"}.
            {jobSetup?.scheduledDate ? ` Scheduled ${jobSetup.scheduledDate}${jobSetup.scheduledTime ? ` at ${jobSetup.scheduledTime}` : ""}.` : " No service date set."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Metric title="Vehicles selected" value={selectedIds.length} />
            <Metric title="Filter fitment resolved" value={specResolved} />
            <Metric title="Price per vehicle" value={jobSetup?.servicePackagePrice ?? 0} prefix="$" />
            <Metric
              title="Estimated total"
              value={Number(((jobSetup?.servicePackagePrice ?? 0) * selectedIds.length).toFixed(2))}
              prefix="$"
            />
          </div>

          {result?.error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm">{result.error}</div>
          )}

          {result && result.blockingValidations.length > 0 && (
            <div className="rounded border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-1">
              <p className="font-medium">Server validation blocked this batch:</p>
              {result.blockingValidations.map((entry) => (
                <p key={entry.key} className="text-xs">• {entry.message}</p>
              ))}
            </div>
          )}

          {result && result.createdIds.length > 0 ? (
            <div className="rounded border border-emerald-500/50 bg-emerald-500/10 p-3 text-sm">
              Created {result.createdIds.length} work orders from this list.
            </div>
          ) : null}

          <div className="max-h-72 overflow-auto rounded border">
            {committed.map((row) => {
              const payload = { ...row.mappedPayload, ...row.decodedPayload, ...row.resolutionPayload };
              const id = String(row.existingVehicleId);
              const isIncluded = !excluded.has(id);
              return (
                <div key={row.id} className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {payload.unitNumber ? `#${payload.unitNumber} — ` : ""}
                      {[payload.year, payload.make, payload.model].filter(Boolean).join(" ") || "Vehicle"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {payload.vin || "no VIN"}
                      {row.specPayload?.filters?.length ? ` • ${row.specPayload.filters.map((f) => f.partNumber).join(", ")}` : ""}
                      {row.specPayload?.missingCategories?.length ? ` • missing: ${row.specPayload.missingCategories.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.specPayload && <Badge variant="outline" className="text-[11px]">{row.specPayload.status}</Badge>}
                    <Button size="sm" variant={isIncluded ? "outline" : "secondary"} onClick={() => toggle(id)}>
                      {isIncluded ? "Exclude" : "Include"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {committed.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">No committed vehicles in batch {batch.id}.</p>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={onSkip}>Skip for now</Button>
            {result && result.createdIds.length > 0 ? (
              <Button onClick={onOpenWorkOrders}>Open work orders</Button>
            ) : (
              <Button onClick={() => onCreate(selectedIds)} disabled={loading || selectedIds.length === 0}>
                {loading ? "Creating..." : `Create ${selectedIds.length} work orders`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, prefix = "" }: { title: string; value: number; prefix?: string }) {
  return (
    <div className="rounded border p-3">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-xl font-semibold">{prefix}{value}</p>
    </div>
  );
}
