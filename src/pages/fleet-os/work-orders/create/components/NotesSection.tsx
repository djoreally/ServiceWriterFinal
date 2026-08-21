import type { Dispatch } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote } from "lucide-react";
import type { WorkOrderDraftAction, WorkOrderDraftState } from "../state/workOrderReducer";

interface Props {
  state: WorkOrderDraftState;
  dispatch: Dispatch<WorkOrderDraftAction>;
}

export const NotesSection = ({ state, dispatch }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="text-base flex items-center gap-2">
        <StickyNote className="h-4 w-4 text-slate-500" /> 7. Notes
      </CardTitle>
    </CardHeader>
    <CardContent>
      <Textarea
        value={state.notes}
        onChange={(e) => dispatch({ type: "SET_NOTES", notes: e.target.value })}
        placeholder="Internal notes visible to dispatch and technicians…"
        rows={3}
      />
    </CardContent>
  </Card>
);
