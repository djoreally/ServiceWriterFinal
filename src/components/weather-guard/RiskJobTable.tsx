import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, ShieldOff, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  evaluateAppointmentNow,
  executeWeatherAction,
  type AtRiskAppointment,
} from "@/application/queries/weather-guard.query";

function decisionBadge(decision: string | null, score: number | null) {
  if (!decision || decision === "OK") return <Badge variant="secondary">Safe</Badge>;
  if (decision === "WARN") return <Badge className="bg-yellow-500 hover:bg-yellow-500/90">Warn ({score})</Badge>;
  if (decision === "SUGGEST_RESCHEDULE")
    return <Badge className="bg-orange-500 hover:bg-orange-500/90">Reschedule ({score})</Badge>;
  return <Badge variant="destructive">Block ({score})</Badge>;
}

export function RiskJobTable({
  jobs,
  onRefresh,
}: {
  jobs: AtRiskAppointment[];
  onRefresh: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const reEvaluate = async (id: string) => {
    setBusyId(id);
    try {
      await evaluateAppointmentNow(id);
      toast.success("Re-evaluated");
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const block = async (id: string) => {
    setBusyId(id);
    try {
      await executeWeatherAction(id, "BLOCK", "Manually blocked from Weather Guard");
      toast.success("Appointment blocked");
      onRefresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm">Upcoming jobs (next 48h)</CardTitle>
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer / Job</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                  No upcoming appointments in the next 48 hours.
                </TableCell>
              </TableRow>
            )}
            {jobs.map((j) => (
              <TableRow key={j.id}>
                <TableCell className="font-medium">{j.guest_name ?? j.title}</TableCell>
                <TableCell className="text-sm">
                  {j.scheduled_date} · {j.scheduled_time.slice(0, 5)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {j.location_address ?? "—"}
                </TableCell>
                <TableCell>{decisionBadge(j.weather_decision, j.weather_risk_score)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reEvaluate(j.id)}
                      disabled={busyId === j.id}
                    >
                      {busyId === j.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CalendarClock className="h-3 w-3" />}
                      <span className="ml-1.5">Re-check</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => block(j.id)}
                      disabled={busyId === j.id}
                    >
                      <ShieldOff className="mr-1.5 h-3 w-3" />
                      Block
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
