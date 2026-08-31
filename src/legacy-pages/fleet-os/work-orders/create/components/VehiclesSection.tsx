import { useEffect, useMemo, useState } from "react";
import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Car, Sparkles } from "lucide-react";
import { fetchFleetVehicleEligibility, type FleetVehicleEligibility, type FleetWorkOrderCreateOptions } from "@/application/queries";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";
import type { DraftVehicleRef } from "@/application/commands/fleet-work-order-draft.command";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  options: FleetWorkOrderCreateOptions | null;
}

type Mode = "manual" | "smart";

const STATUS_RANK: Record<string, number> = { overdue: 3, due: 2, due_soon: 1, on_track: 0 };
const STATUS_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  overdue: "destructive",
  due: "default",
  due_soon: "secondary",
};

export const VehiclesSection = ({ state, dispatch, options }: Props) => {
  const [mode, setMode] = useState<Mode>("manual");
  const [query, setQuery] = useState("");
  const [eligibility, setEligibility] = useState<Record<string, FleetVehicleEligibility>>({});
  const [loadingEligibility, setLoadingEligibility] = useState(false);

  const eligibleVehicles = useMemo(() => {
    if (!options || !state.customer) return [];
    return options.vehicles.filter(
      (v) =>
        v.fleet_client_id === state.customer!.id &&
        (!state.location || v.fleet_location_id === state.location!.id),
    );
  }, [options, state.customer, state.location]);

  // Fetch real eligibility whenever the customer changes.
  useEffect(() => {
    if (!state.customer) {
      void Promise.resolve().then(() => setEligibility({}));
      return;
    }
    let cancelled = false;
    void Promise.resolve().then(() => setLoadingEligibility(true));
    void Promise.resolve().then(() => fetchFleetVehicleEligibility(state.customer.id)
      .then((rows) => {
        if (cancelled) return;
        // Keep the most-critical row per vehicle.
        const map: Record<string, FleetVehicleEligibility> = {};
        for (const row of rows) {
          const existing = map[row.fleet_vehicle_id];
          if (!existing || (STATUS_RANK[row.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
            map[row.fleet_vehicle_id] = row;
          }
        }
        setEligibility(map);
      })
      .catch((err) => console.error("[VehiclesSection] eligibility fetch failed", err))
      .finally(() => {
        if (!cancelled) setLoadingEligibility(false);
      }));
    return () => {
      cancelled = true;
    };
  }, [state.customer]);

  const filtered = useMemo(() => {
    if (!query) return eligibleVehicles;
    const q = query.toLowerCase();
    return eligibleVehicles.filter((v) =>
      [v.unit_number, v.make, v.model, v.vin, v.license_plate]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [eligibleVehicles, query]);

  const selectedIds = new Set(state.vehicles.map((v) => v.id));

  const toggle = (v: (typeof eligibleVehicles)[number]) => {
    const elig = eligibility[v.id];
    const ref: DraftVehicleRef = {
      id: v.id,
      unit_number: v.unit_number,
      year: v.year,
      make: v.make,
      model: v.model,
      vin: v.vin,
      eligibility: elig
        ? {
            reason: elig.status,
            severity: elig.status === "overdue" ? "high" : elig.status === "due" ? "medium" : "low",
          }
        : null,
    };
    dispatch({ type: "TOGGLE_VEHICLE", vehicle: ref });
  };

  const runSmartSelect = () => {
    // Real Smart PM — pick vehicles the eligibility service flags as due or overdue.
    const dueRows = eligibleVehicles.filter((v) => {
      const e = eligibility[v.id];
      return e && (e.status === "due" || e.status === "overdue");
    });
    dispatch({
      type: "SET_VEHICLES",
      vehicles: dueRows.map((v) => {
        const e = eligibility[v.id]!;
        return {
          id: v.id,
          unit_number: v.unit_number,
          year: v.year,
          make: v.make,
          model: v.model,
          vin: v.vin,
          eligibility: {
            reason: e.status,
            severity: e.status === "overdue" ? "high" : "medium",
          },
        };
      }),
    });
    setMode("smart");
  };

  const dueCount = Object.values(eligibility).filter((e) => e.status === "due" || e.status === "overdue").length;

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Car className="h-4 w-4 text-amber-500" /> 3. Vehicles
          {state.vehicles.length > 0 && (
            <Badge variant="secondary" className="ml-2">{state.vehicles.length} selected</Badge>
          )}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant={mode === "manual" ? "default" : "outline"}
            onClick={() => setMode("manual")}
          >
            Manual
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "smart" ? "default" : "outline"}
            onClick={runSmartSelect}
            disabled={!state.customer || loadingEligibility || dueCount === 0}
            title={dueCount === 0 ? "No vehicles due" : `${dueCount} vehicles due/overdue`}
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Smart PM {dueCount > 0 && `(${dueCount})`}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!state.customer && (
          <p className="text-xs text-muted-foreground">Select a customer first.</p>
        )}
        {state.customer && (
          <>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vehicles by unit, VIN, make…"
            />
            <div className="max-h-72 overflow-auto rounded-md border divide-y">
              {filtered.map((v) => {
                const checked = selectedIds.has(v.id);
                const elig = eligibility[v.id];
                const variant = elig ? STATUS_VARIANT[elig.status] : undefined;
                return (
                  <label
                    key={v.id}
                    className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(v)} />
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>
                          {v.unit_number ? `#${v.unit_number} · ` : ""}
                          {v.year} {v.make} {v.model}
                        </span>
                        {elig && variant && (
                          <Badge variant={variant} className="text-[10px] uppercase">
                            {elig.status.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.vin || "No VIN"} {v.mileage ? `· ${v.mileage.toLocaleString()} mi` : ""}
                        {elig?.due_date && ` · due ${new Date(elig.due_date).toLocaleDateString()}`}
                        {elig?.due_mileage && ` · @${elig.due_mileage.toLocaleString()} mi`}
                      </div>
                    </div>
                  </label>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">No vehicles match.</p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
