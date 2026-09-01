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

  const refreshGate = useCallback(async () => {
    try { setGate(await fetchAppointmentInspectionGate(appointment.id)); }
    catch { setGate({ required: [], pendingCount: 0 }); }
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
  else step = "complete";

  const handleStart = async () => {
    setStarting(true);
    const res = await startAppointmentJob(appointment.id);
    setStarting(false);
    if (!res.success) { toast.error(res.error || "Failed to start job"); return; }
    toast.success(res.alreadyStarted ? "Job already started" : "Job started — timer running");
    onUpdated();
  };

  const handleCompleteSuccess = (serviceId: string) => {
    setShowComplete(false); onUpdated(); toast.success("Service record created"); navigate(`/services/${serviceId}`);
  };

  if (step === "loading") return <Button className={className} variant="default" disabled><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</Button>;
  if (step === "done") return <Button className={className} variant="outline" onClick={() => { const svc = appointment.service_record_id; if (svc) navigate(`/services/${svc}`); }}><FileText className="h-4 w-4 mr-2" />View Service Record</Button>;
  if (step === "start") return <Button className={className} variant="default" onClick={handleStart} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Start Job</Button>;

  if (step === "inspection") {
    const pending = gate?.required.filter((r) => !r.completed) ?? [];
    return <>
      <Button className={className} variant="default" onClick={() => setShowInspection(true)}><ClipboardCheck className="h-4 w-4 mr-2" />Fill Inspection ({pending.length} pending)</Button>
      <Dialog open={showInspection} onOpenChange={setShowInspection}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Required Inspection</DialogTitle><DialogDescription>Complete the inspection below to unlock job completion.</DialogDescription></DialogHeader>
          <InspectionPerformer appointmentId={appointment.id} vehicleId={appointment.vehicle?.id} onComplete={async () => { await refreshGate(); setShowInspection(false); }} />
        </DialogContent>
      </Dialog>
    </>;
  }

  return <>
    <Button className={className} variant="default" onClick={() => setShowComplete(true)}><CheckCircle2 className="h-4 w-4 mr-2" />Complete Job</Button>
    <CompleteAppointmentDialog open={showComplete} onOpenChange={setShowComplete} appointment={appointment} onSuccess={handleCompleteSuccess} />
  </>;
}
