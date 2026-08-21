import { useMemo, useState } from "react";
import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Building2, CheckCircle2 } from "lucide-react";
import type { FleetWorkOrderCreateOptions } from "@/application/queries";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  options: FleetWorkOrderCreateOptions | null;
}

export const CustomerSection = ({ state, dispatch, options }: Props) => {
  const [query, setQuery] = useState("");

  const clients = options?.clients || [];
  const filtered = useMemo(
    () => clients.filter((c) => !query || c.company_name.toLowerCase().includes(query.toLowerCase())).slice(0, 6),
    [clients, query],
  );

  const stats = useMemo(() => {
    if (!state.customer || !options) return null;
    const vehicleCount = options.vehicles.filter((v) => v.fleet_client_id === state.customer!.id).length;
    const locationCount = options.locations.filter((l) => l.fleet_client_id === state.customer!.id).length;
    const activeContract = options.contracts.some((c) => c.fleet_client_id === state.customer!.id && c.is_active);
    return { vehicleCount, locationCount, activeContract };
  }, [state.customer, options]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-blue-500" /> 1. Customer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fleet customer…"
        />
        <div className="space-y-1">
          {filtered.map((c) => {
            const selected = state.customer?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => dispatch({ type: "SET_CUSTOMER", customer: { id: c.id, name: c.company_name } })}
                className={`w-full text-left rounded-md border px-3 py-2 text-sm transition ${
                  selected ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "hover:bg-muted/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{c.company_name}</span>
                  {selected && <CheckCircle2 className="h-4 w-4 text-blue-500" />}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground">No matching customers.</p>
          )}
        </div>
        {state.customer && stats && (
          <div className="rounded-md border bg-muted/20 p-3 text-xs grid grid-cols-3 gap-2">
            <div><div className="font-semibold">{stats.vehicleCount}</div><div className="text-muted-foreground">Vehicles</div></div>
            <div><div className="font-semibold">{stats.locationCount}</div><div className="text-muted-foreground">Locations</div></div>
            <div><div className="font-semibold">{stats.activeContract ? "Active" : "None"}</div><div className="text-muted-foreground">Contract</div></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
