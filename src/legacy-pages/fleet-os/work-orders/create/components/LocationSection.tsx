import { useMemo } from "react";
import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";
import type { FleetWorkOrderCreateOptions } from "@/application/queries";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  options: FleetWorkOrderCreateOptions | null;
}

export const LocationSection = ({ state, dispatch, options }: Props) => {
  const locations = useMemo(
    () => (options?.locations || []).filter((l) => l.fleet_client_id === state.customer?.id),
    [options?.locations, state.customer?.id],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MapPin className="h-4 w-4 text-emerald-500" /> 2. Location
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={state.location?.id ?? ""}
          onValueChange={(v) => {
            const loc = locations.find((l) => l.id === v);
            if (!loc) return;
            dispatch({
              type: "SET_LOCATION",
              location: {
                id: loc.id,
                name: loc.name || "Location",
                city: loc.city,
                service_window_start: loc.service_window_start,
                service_window_end: loc.service_window_end,
              },
            });
          }}
          disabled={!state.customer || locations.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={state.customer ? "Select a customer location" : "Select a customer first"} />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} {l.city ? `— ${l.city}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.customer && locations.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            This customer has no locations. Add one from the customer profile first.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
