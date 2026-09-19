import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Play, ClipboardCheck, CheckCircle2, Loader2, FileText } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { startAppointmentJob } from "@/application/commands/appointment-detail.command";
import { fetchAppointmentInspectionGate, type AppointmentInspectionGate } from "@/application/queries/inspections.query";
import { InspectionPerformer } from "@/components/inspections/InspectionPerformer";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import { fetchAppointmentRecommendations, resolveApprovedRecommendation } from "@/application/commands/service-recommendation.command";
import type { Appointment } from "@/shared/types";

interface JobActionButtonProps { appointment: JobActionAppointment; onUpdated: () => void; className?: string; }
type JobActionAppointment = Appointment & { actual_start_time?: string | null; };
type Step = "loading" | "start" | "inspection" | "complete" | "done";

export function JobActionButton({ appointment, onUpdated, className }: JobActionButtonProps) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [gate, setGate] = useState<AppointmentInspectionGate | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [approvedWork, setApprovedWork] = useState<any[]>([]);
  const [resolvingRecommendation, setResolvingRecommendation] = useState<string | null>(null);

  const refreshGate = useCallback(async () => {
    try { setGate(await fetchAppointmentInspectionGate(appointment.id)); }
    catch { setGate({ required: [], pendingCount: 0 }); }
    try {
      const recommendations = await fetchAppointmentRecommendations(appointment.id);
      setApprovedWork(recommendations.filter((row: any) => row.status === "approved"));
    } catch {
      setApprovedWork([]);
    }
  }, [appointment.id]);

  useEffect(() => { void Promise.resolve().then(() => refreshGate()); }, [refreshGate]);

  const status = (appointment.status || "").toLowerCase();
  const dispatchStatus = (appointment.dispatch_status || "").toLowerCase();
  const started = status === "in_progress" || dispatchStatus === "in_progress" || Boolean(appointment.actual_start_time);
  const isCompleted = status === "completed" || dispatchStatus === "completed";

  let step: Step = "loading";
  if (gate === null) step = "loading";
  else if (isCompleted) step = "done";
  else if (!started) step = "start";
  else if (gate.pendingCount > 0) step = "inspection";
  else if (approvedWork.length > 0) step = "inspection";
  else step = "complete";

  const handleStart = async () => {
    setStarting(true);
    const res = await startAppointmentJob(appointment.id);
    if (!res.success) {
      setStarting(false);
      toast.error(res.error || "Failed to start job");
      return;
    }
    const nextGate = await fetchAppointmentInspectionGate(appointment.id).catch(() => ({ required: [], pendingCount: 0 }));
    setGate(nextGate);
    setStarting(false);
    toast.success(res.alreadyStarted ? "Job already started" : "Job started — verify vehicle and complete inspection");
    onUpdated();
    if (nextGate.pendingCount > 0) setShowInspection(true);
  };

  const handleCompleteSuccess = (_serviceId: string) => {
    onUpdated();
    toast.success("Service history created");
  };

  if (step === "loading") return <Button className={className} variant="default" disabled><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</Button>;
  if (step === "done") return <Button className={className} variant="outline" onClick={() => { const svc = appointment.service_record_id; if (svc) navigate(`/services/${svc}`); }}><FileText className="h-4 w-4 mr-2" />View Service Record</Button>;
  if (step === "start") return <Button className={className} variant="default" onClick={handleStart} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Start Job</Button>;

  if (step === "inspection") {
    const pending = gate?.required.filter((r) => !r.completed) ?? [];
    const current = pending[0];

    if (pending.length === 0 && approvedWork.length > 0) {
      return <div className={className}>
        <div className="space-y-2 rounded-lg border p-3">
          <div className="font-medium">Approved additional work</div>
          {approvedWork.map((recommendation: any) => (
            <div key={recommendation.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{recommendation.description}</div>
                <div className="text-xs text-muted-foreground">
                  {recommendation.price != null ? `${Number(recommendation.price).toFixed(2)} · ` : ""}
                  {recommendation.vehicle_description || `Vehicle ${String(recommendation.vehicle_id).slice(0, 8)}`}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={resolvingRecommendation === recommendation.id}
                  onClick={async () => {
                    setResolvingRecommendation(recommendation.id);
                    try {
                      await resolveApprovedRecommendation(recommendation.id, "completed");
                      toast.success("Approved work marked complete");
                      await refreshGate();
                      onUpdated();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to complete approved work");
                    } finally { setResolvingRecommendation(null); }
                  }}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" />Work Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={resolvingRecommendation === recommendation.id}
                  onClick={async () => {
                    const reason = window.prompt("Why could this approved work not be completed?");
                    if (!reason?.trim()) return;
                    setResolvingRecommendation(recommendation.id);
                    try {
                      await resolveApprovedRecommendation(recommendation.id, "unable_to_complete", reason);
                      toast.success("Approved work marked unable to complete");
                      await refreshGate();
                      onUpdated();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Unable to resolve approved work");
                    } finally { setResolvingRecommendation(null); }
                  }}
                >
                  Unable to Complete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>;
    }

    return <>
      <Button className={className} variant="default" onClick={() => setShowInspection(true)}><ClipboardCheck className="h-4 w-4 mr-2" />Service Inspection ({pending.length} pending)</Button>
      <Dialog open={showInspection} onOpenChange={setShowInspection}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Service Inspection</DialogTitle>
            <DialogDescription>{current ? `${current.templateName} is required for this vehicle. ` : ""}Complete required checks early so recommendations can be sent while the original work continues.</DialogDescription>
          </DialogHeader>
          <InspectionPerformer appointmentId={appointment.id} vehicleId={current?.vehicleId ?? appointment.vehicle?.id} onComplete={async () => { await refreshGate(); setShowInspection(false); }} />
        </DialogContent>
      </Dialog>
    </>;
  }

  return <>
    <Button className={className} variant="default" onClick={() => setShowComplete(true)}><CheckCircle2 className="h-4 w-4 mr-2" />Complete Job</Button>
    <CompleteAppointmentDialog open={showComplete} onOpenChange={setShowComplete} appointment={appointment} onSuccess={handleCompleteSuccess} />
  </>;
}
