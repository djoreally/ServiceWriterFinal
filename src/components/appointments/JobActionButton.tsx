import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Play, ClipboardCheck, CheckCircle2, Loader2, FileText, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useNavigate } from "react-router-dom";
import { startAppointmentJob } from "@/application/commands/appointment-detail.command";
import { fetchAppointmentInspectionGate, type AppointmentInspectionGate } from "@/application/queries/inspections.query";
import { InspectionPerformer } from "@/components/inspections/InspectionPerformer";
import { CompleteAppointmentDialog } from "@/components/appointments/CompleteAppointmentDialog";
import type { Appointment } from "@/shared/types";

interface JobActionButtonProps { appointment: JobActionAppointment; onUpdated: () => void; className?: string; }
type JobActionAppointment = Appointment & { actual_start_time?: string | null; };
type Step = "loading" | "start" | "inspection" | "complete" | "done" | "gate_error";

export function JobActionButton({ appointment, onUpdated, className }: JobActionButtonProps) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [gate, setGate] = useState<AppointmentInspectionGate | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  const refreshGate = useCallback(async () => {
    setGateError(null);
    try {
      setGate(await fetchAppointmentInspectionGate(appointment.id));
    } catch (error) {
      setGate(null);
      setGateError(error instanceof Error ? error.message : "Required inspection status could not be verified.");
    }
  }, [appointment.id]);

  useEffect(() => { void Promise.resolve().then(() => refreshGate()); }, [refreshGate]);

  const status = (appointment.status || "").toLowerCase();
  const dispatchStatus = (appointment.dispatch_status || "").toLowerCase();
  const started = status === "in_progress" || dispatchStatus === "in_progress" || dispatchStatus === "started" || Boolean(appointment.actual_start_time);
  const isCompleted = status === "completed" || dispatchStatus === "completed";

  let step: Step = "loading";
  if (isCompleted) step = "done";
  else if (!started) step = "start";
  else if (gateError) step = "gate_error";
  else if (gate === null) step = "loading";
  else if (gate.pendingCount > 0) step = "inspection";
  else step = "complete";

  const actionClass = [
    className,
    "max-md:fixed max-md:left-4 max-md:right-4 max-md:bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)]",
    "max-md:z-40 max-md:w-auto max-md:shadow-2xl",
  ].filter(Boolean).join(" ");

  const handleStart = async () => {
    setStarting(true);
    const res = await startAppointmentJob(appointment.id);
    if (!res.success) {
      setStarting(false);
      toast.error(res.error || "Failed to start job");
      return;
    }

    try {
      const nextGate = await fetchAppointmentInspectionGate(appointment.id);
      setGate(nextGate);
      setGateError(null);
      toast.success(res.alreadyStarted ? "Job already started" : "Job started");
      onUpdated();
      if (nextGate.pendingCount > 0) setShowInspection(true);
    } catch (error) {
      setGate(null);
      setGateError(error instanceof Error ? error.message : "Required inspection status could not be verified.");
      toast.error("Job started, but the required inspection checklist could not be verified. Retry before completing this job.");
      onUpdated();
    } finally {
      setStarting(false);
    }
  };

  const handleCompleteSuccess = (serviceId: string) => {
    setShowComplete(false);
    onUpdated();
    toast.success("Service record created");
    navigate(`/services/${serviceId}`);
  };

  if (step === "loading") {
    if (!started && !isCompleted) {
      return <Button className={actionClass} variant="default" onClick={handleStart} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Start Job</Button>;
    }
    return <Button className={actionClass} variant="default" disabled><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading job…</Button>;
  }

  if (step === "gate_error") {
    return <Button className={actionClass} variant="destructive" onClick={() => void refreshGate()}><RefreshCw className="h-4 w-4 mr-2" />Retry Inspection Check</Button>;
  }

  if (step === "done") return <Button className={actionClass} variant="outline" onClick={() => { const svc = appointment.service_record_id; if (svc) navigate(`/services/${svc}`); }}><FileText className="h-4 w-4 mr-2" />View Service Record</Button>;
  if (step === "start") return <Button className={actionClass} variant="default" onClick={handleStart} disabled={starting}>{starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}Start Job</Button>;

  if (step === "inspection") {
    const pending = gate?.required.filter((r) => !r.completed) ?? [];
    const current = pending[0];
    return <>
      <Button className={actionClass} variant="default" onClick={() => setShowInspection(true)}><ClipboardCheck className="h-4 w-4 mr-2" />Service Inspection ({pending.length} pending)</Button>
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
    <Button className={actionClass} variant="default" onClick={() => setShowComplete(true)}><CheckCircle2 className="h-4 w-4 mr-2" />Complete Job</Button>
    <CompleteAppointmentDialog open={showComplete} onOpenChange={setShowComplete} appointment={appointment} onSuccess={handleCompleteSuccess} />
  </>;
}
