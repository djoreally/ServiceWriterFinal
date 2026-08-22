import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
  technicians: { id: string; name: string }[];
}

export const ScheduleSection = ({ state, dispatch, technicians }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base flex items-center gap-2">
        <Calendar className="h-4 w-4 text-violet-500" /> 5. Schedule
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Date</Label>
          <Input
            type="date"
            value={state.scheduledDate}
            onChange={(e) => dispatch({ type: "SET_SCHEDULE", date: e.target.value })}
          />
        </div>
        <div>
          <Label>Time window</Label>
          <Input
            type="time"
            value={state.scheduledTime}
            onChange={(e) => dispatch({ type: "SET_SCHEDULE", time: e.target.value })}
          />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label>Technician</Label>
          <Button
            type="button"
            variant={state.assignLater ? "default" : "outline"}
            size="sm"
            onClick={() =>
              dispatch({
                type: "SET_TECHNICIAN",
                technicianId: null,
                assignLater: !state.assignLater,
              })
            }
          >
            {state.assignLater ? "Assign later ✓" : "Assign later"}
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {technicians.map((t) => {
            const active = state.technicianId === t.id;
            return (
              <Button
                key={t.id}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                onClick={() => dispatch({ type: "SET_TECHNICIAN", technicianId: t.id, assignLater: false })}
                disabled={state.assignLater}
              >
                {t.name}
              </Button>
            );
          })}
          {technicians.length === 0 && (
            <p className="text-xs text-muted-foreground">No technicians available.</p>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
);
