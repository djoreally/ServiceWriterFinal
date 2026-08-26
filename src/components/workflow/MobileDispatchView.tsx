/**
 * MobileDispatchView - Tablet/Phone-first interface for field technicians
 * 
 * Features:
 * - Large touch targets
 * - Job detail page with status actions (enroute, start, complete)
 * - One-tap navigation to job sites
 * - Quick status updates with customer notification
 * - Offline-friendly design
 */

import { useState, useEffect, useCallback } from "react";
import {
  getAuthUser,
  fetchTechnicianRecord,
  fetchActiveClockEntry,
  fetchTechnicianJobs,
  subscribeMobileDispatch,
} from "@/application/queries/mobile-dispatch.query";
import {
  updateDispatchStatusRpc,
  updateTechnicianLocationRpc,
  sendSmsByFunction,
} from "@/application/commands/mobile-dispatch.command";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MapPin,
  Navigation,
  Clock,
  User,
  Phone,
  Car,
  Wrench,
  CheckCircle2,
  ChevronRight,
  Play,
  MapPinned,
  CalendarClock,
  Loader2,
  RefreshCw,
  CircleDot,
  Coffee,
  ArrowLeft,
  MessageSquare,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { format, parseISO, differenceInMinutes, isToday, isTomorrow } from "date-fns";
import { cn } from "@/lib/utils";
import {
  canTransitionDispatchStatus,
  getNextDispatchStatus,
  normalizeDispatchStatus,
  normalizeOperationalTechnicianStatus,
  normalizeTechnicianStatus,
  type DispatchStatus,
  type TechnicianOperationalStatus,
} from "@/lib/dispatch-state";

interface Job {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  address: string | null;
  location: { lat: number; lng: number } | null;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string | null;
  vehicle_plate: string | null;
  service_name: string;
  service_notes: string | null;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration: number;
  dispatch_status: DispatchStatus;
  job_priority: "low" | "normal" | "high" | "urgent";
  actual_start_time: string | null;
  actual_end_time: string | null;
}

interface TechnicianStatus {
  status: TechnicianOperationalStatus;
  current_job_id: string | null;
  active_clock_entry: boolean;
}

// ⚡ Status flow with customer-facing SMS text for each transition
const DISPATCH_STATUS_FLOW: Partial<Record<DispatchStatus, { next: DispatchStatus; action: string; icon: typeof Play; smsTemplate?: string }>> = {
  assigned: { next: "en_route", action: "Start Route", icon: Navigation, smsTemplate: "Your technician is on the way! ETA approximately {duration} minutes." },
  en_route: { next: "arrived", action: "Mark Arrived", icon: MapPinned, smsTemplate: "Your technician has arrived and is ready to begin service." },
  arrived: { next: "in_progress", action: "Start Job", icon: Play },
  in_progress: { next: "completed", action: "Complete Job", icon: CheckCircle2 },
};

const STATUS_COLORS: Record<DispatchStatus, string> = {
  unassigned: "bg-gray-50 text-gray-500 border-gray-200",
  assigned: "bg-gray-100 text-gray-700 border-gray-200",
  acknowledged: "bg-indigo-100 text-indigo-700 border-indigo-200",
  auto_assigned: "bg-purple-100 text-purple-700 border-purple-200",
  en_route: "bg-blue-100 text-blue-700 border-blue-200",
  arrived: "bg-yellow-100 text-yellow-700 border-yellow-200",
  in_progress: "bg-gray-100 text-gray-700 border-gray-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-600",
  high: "bg-orange-100 text-orange-600",
  urgent: "bg-red-100 text-red-600",
};

export function MobileDispatchView() {
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [techStatus, setTechStatus] = useState<TechnicianStatus | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [detailOpen, setDetailOpen] = useState(false);

  // Update current time
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = useCallback(async () => {
    const user = await getAuthUser();
    if (!user) return;

    setLoading(true);
    try {
      const { data: techData } = await fetchTechnicianRecord(user.id);

      if (techData) {
        const { data: clockEntry } = await fetchActiveClockEntry(user.id);
        const activeClockEntry = (clockEntry?.length || 0) > 0;
        const normalizedTechStatus = normalizeTechnicianStatus((techData as { status?: unknown }).status);

        const { data: jobsData } = await fetchTechnicianJobs(techData.id);

        if (jobsData) {
          const mapped = (jobsData as any[]).map((j: any) => ({
            id: j.id,
            customer_name: j.customer?.name || "Unknown",
            customer_phone: j.customer?.phone || null,
            address: j.customer?.address || null,
            location: null as any,
            vehicle_year: j.vehicle?.year || 0,
            vehicle_make: j.vehicle?.make || "Unknown",
            vehicle_model: j.vehicle?.model || "",
            vehicle_color: j.vehicle?.color || null,
            vehicle_plate: j.vehicle?.license_plate || null,
            service_name: j.service_catalog?.name || "Service",
            service_notes: j.notes || null,
            scheduled_date: j.scheduled_date,
            scheduled_time: j.scheduled_time,
            estimated_duration: j.estimated_duration_minutes || 60,
            dispatch_status: normalizeDispatchStatus(j.dispatch_status || "assigned"),
            job_priority: (j.job_priority || "normal") as Job["job_priority"],
            actual_start_time: j.actual_start_time,
            actual_end_time: j.actual_end_time,
          })) as Job[];

          const currentJob =
            mapped.find((job) => job.dispatch_status === "in_progress") ||
            mapped.find((job) => job.dispatch_status === "arrived") ||
            mapped.find((job) => job.dispatch_status === "en_route") ||
            mapped.find((job) => job.dispatch_status === "assigned") ||
            null;

          // Keep technician state coherent with shift + assignment context from the same fetch tick.
          setTechStatus({
            status: normalizeOperationalTechnicianStatus({
              technicianStatus: normalizedTechStatus,
              shiftActive: activeClockEntry,
              hasCurrentAppointment: !!currentJob,
              currentDispatchStatus: currentJob?.dispatch_status,
            }),
            current_job_id: currentJob?.id || null,
            active_clock_entry: activeClockEntry,
          });

          setJobs(mapped);

          // Sync selected job if detail is open
          if (selectedJob) {
            const updated = mapped.find(j => j.id === selectedJob.id);
            if (updated) setSelectedJob(updated);
          }
        } else {
          setTechStatus({
            status: normalizeOperationalTechnicianStatus({
              technicianStatus: normalizedTechStatus,
              shiftActive: activeClockEntry,
              hasCurrentAppointment: false,
            }),
            current_job_id: null,
            active_clock_entry: activeClockEntry,
          });
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedJob]);

  useEffect(() => {
    fetchData();
    const sub = subscribeMobileDispatch(() => fetchData());
    return () => { sub.unsubscribe(); };
  }, [fetchData]);

  const updateLocation = async () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          await updateTechnicianLocationRpc(
            position.coords.latitude,
            position.coords.longitude,
            position.coords.speed,
            position.coords.heading,
          );
        } catch (error) {
          console.error("Location update error:", error);
        }
      },
      (error) => console.warn("Location error:", error),
      { enableHighAccuracy: true }
    );
  };

  /** Update dispatch status and optionally send an SMS notification to the customer */
  const handleStatusUpdate = async (job: Job, newStatus: DispatchStatus) => {
    setProcessing(true);
    try {
      const currentStatus = normalizeDispatchStatus(job.dispatch_status);
      if (!canTransitionDispatchStatus(currentStatus, newStatus)) {
        toast.error("Job status changed. Refresh and try again.");
        return;
      }

      await updateLocation();

      const { error } = await updateDispatchStatusRpc(job.id, newStatus);

      if (error) throw error;

      // Send customer notification SMS for en_route and arrived transitions
      const flowStep = DISPATCH_STATUS_FLOW[currentStatus];
      if (flowStep?.smsTemplate && job.customer_phone) {
        const smsText = flowStep.smsTemplate.replace("{duration}", String(job.estimated_duration));
        try {
          await sendSmsByFunction(job.customer_phone, smsText, job.id);
        } catch (smsErr) {
          // Non-blocking: log but don't fail the status update
          console.warn("Customer SMS notification failed:", smsErr);
        }
      }

      toast.success(`Status updated: ${newStatus.replace("_", " ")}`);

      if (newStatus === "completed") {
        setConfirmComplete(false);
        setSelectedJob(null);
        setDetailOpen(false);
      }

      fetchData();
    } catch (error) {
      console.error("Status update error:", error);
      toast.error("Failed to update status");
    } finally {
      setProcessing(false);
    }
  };

  const openNavigation = (job: Job) => {
    if (job.address) {
      const encodedAddress = encodeURIComponent(job.address);
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const url = isIOS
        ? `maps://maps.apple.com/?daddr=${encodedAddress}`
        : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`;
      window.open(url, "_blank");
    } else if (job.location) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${job.location.lat},${job.location.lng}`, "_blank");
    }
  };

  const callCustomer = (phone: string) => { window.location.href = `tel:${phone}`; };

  const getTimeDisplay = (job: Job) => {
    const date = parseISO(job.scheduled_date);
    if (isToday(date)) return `Today at ${job.scheduled_time}`;
    if (isTomorrow(date)) return `Tomorrow at ${job.scheduled_time}`;
    return `${format(date, "MMM d")} at ${job.scheduled_time}`;
  };

  const getJobDuration = (job: Job) => {
    if (!job.actual_start_time) return null;
    const minutes = differenceInMinutes(new Date(), parseISO(job.actual_start_time));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const sortedJobs = [...jobs].sort((a, b) => {
    const statusOrder: Record<DispatchStatus, number> = {
      in_progress: 0,
      arrived: 1,
      en_route: 2,
      acknowledged: 3,
      auto_assigned: 3,
      assigned: 3,
      unassigned: 4,
      completed: 5,
      cancelled: 6,
    };
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    const statusDiff = statusOrder[normalizeDispatchStatus(a.dispatch_status)] -
      statusOrder[normalizeDispatchStatus(b.dispatch_status)];
    if (statusDiff !== 0) return statusDiff;
    const priorityDiff = (priorityOrder[a.job_priority as keyof typeof priorityOrder] || 2) -
      (priorityOrder[b.job_priority as keyof typeof priorityOrder] || 2);
    if (priorityDiff !== 0) return priorityDiff;
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  const activeJob = sortedJobs.find(
    (job) =>
      normalizeDispatchStatus(job.dispatch_status) === "in_progress" ||
      normalizeDispatchStatus(job.dispatch_status) === "arrived"
  );

  const openJobDetail = (job: Job) => {
    setSelectedJob(job);
    setDetailOpen(true);
  };

  const selectedJobStatus = selectedJob
    ? normalizeDispatchStatus(selectedJob.dispatch_status)
    : null;
  const selectedFlowStep = selectedJobStatus ? DISPATCH_STATUS_FLOW[selectedJobStatus] : undefined;
  const selectedNextStatus = selectedJobStatus ? getNextDispatchStatus(selectedJobStatus) : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-40 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">My Jobs</h1>
            <p className="text-sm text-muted-foreground">{format(currentTime, "EEEE, MMM d")}</p>
          </div>
          <div className="flex items-center gap-2">
            {techStatus && (
              <Badge variant="outline" className={cn("gap-1",
                techStatus.status === "on_break" ? "bg-orange-50 text-orange-700" :
                techStatus.status === "on_job" || techStatus.status === "on_site" ? "bg-green-50 text-gray-700" :
                techStatus.status === "offline" || techStatus.status === "unavailable" ? "bg-muted text-muted-foreground" :
                "bg-blue-50 text-blue-700"
              )}>
                {techStatus.status === "on_break" ? <Coffee className="h-3 w-3" /> :
                 techStatus.status === "on_job" || techStatus.status === "on_site" ? <Wrench className="h-3 w-3" /> :
                 <CircleDot className="h-3 w-3" />}
                {techStatus.status.replace("_", " ")}
              </Badge>
            )}
            <Button variant="ghost" size="icon" onClick={fetchData}>
              <RefreshCw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Active Job Banner */}
      {activeJob && (
        <button
          className="w-full bg-gray-600 text-white px-4 py-3 text-left"
          onClick={() => openJobDetail(activeJob)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 rounded-md p-2"><Wrench className="h-5 w-5" /></div>
              <div>
                <p className="font-medium">{activeJob.service_name}</p>
                <p className="text-sm text-gray-100">{activeJob.customer_name}</p>
              </div>
            </div>
            {getJobDuration(activeJob) && (
              <div className="text-right">
                <p className="text-2xl font-bold">{getJobDuration(activeJob)}</p>
                <p className="text-xs text-gray-100">elapsed</p>
              </div>
            )}
          </div>
        </button>
      )}

      {/* Job List — tap to open detail */}
      <div className="p-4 space-y-4">
        {sortedJobs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-gray-500 mx-auto mb-4" />
              <p className="text-lg font-medium">All caught up!</p>
              <p className="text-muted-foreground">No pending jobs at the moment</p>
            </CardContent>
          </Card>
        ) : (
          sortedJobs.map((job) => (
            <Card
              key={job.id}
              className={cn(
                "overflow-hidden transition-all cursor-pointer active:scale-[0.98]",
                job.dispatch_status === "in_progress" && "ring-2 ring-green-500",
                job.job_priority === "urgent" && "ring-2 ring-red-500"
              )}
              onClick={() => openJobDetail(job)}
            >
              <CardHeader className="p-4 pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn("capitalize", STATUS_COLORS[job.dispatch_status])}>
                        {job.dispatch_status.replace("_", " ")}
                      </Badge>
                      {job.job_priority !== "normal" && (
                        <Badge className={cn("capitalize", PRIORITY_COLORS[job.job_priority])}>{job.job_priority}</Badge>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold">{job.service_name}</h3>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <CalendarClock className="h-4 w-4" />
                    {getTimeDisplay(job)}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium truncate">{job.customer_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm truncate">{job.vehicle_year} {job.vehicle_make} {job.vehicle_model}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Clock Status Footer */}
      {techStatus && !techStatus.active_clock_entry && (
        <div className="fixed bottom-0 left-0 right-0 bg-orange-500 text-white p-4 text-center">
          <p className="font-medium">You're not clocked in</p>
          <p className="text-sm text-orange-100">Clock in to start tracking your time</p>
        </div>
      )}

      {/* ── Job Detail Sheet ── */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent side="bottom" className="h-[90vh] overflow-auto rounded-t-2xl p-0">
          {selectedJob && (
            <div className="flex flex-col h-full">
              {/* Detail Header */}
              <SheetHeader className="px-4 pt-4 pb-2 border-b">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="icon" onClick={() => setDetailOpen(false)}>
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <div className="flex-1">
                    <SheetTitle className="text-left">{selectedJob.service_name}</SheetTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={cn("capitalize", STATUS_COLORS[selectedJob.dispatch_status])}>
                        {selectedJob.dispatch_status.replace("_", " ")}
                      </Badge>
                      {selectedJob.job_priority !== "normal" && (
                        <Badge className={cn("capitalize", PRIORITY_COLORS[selectedJob.job_priority])}>{selectedJob.job_priority}</Badge>
                      )}
                    </div>
                  </div>
                  {getJobDuration(selectedJob) && (
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-600">{getJobDuration(selectedJob)}</p>
                      <p className="text-xs text-muted-foreground">elapsed</p>
                    </div>
                  )}
                </div>
              </SheetHeader>

              {/* Detail Body */}
              <div className="flex-1 overflow-auto p-4 space-y-4">
                {/* Schedule */}
                <div className="flex items-center gap-3 bg-muted/50 rounded-lg p-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{getTimeDisplay(selectedJob)}</p>
                    <p className="text-xs text-muted-foreground">~{selectedJob.estimated_duration} min</p>
                  </div>
                </div>

                {/* Customer */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Customer</h4>
                  <div className="bg-card border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{selectedJob.customer_name}</span>
                    </div>
                    {selectedJob.customer_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedJob.customer_phone}</span>
                      </div>
                    )}
                    {selectedJob.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <span className="text-sm">{selectedJob.address}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Vehicle */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Vehicle</h4>
                  <div className="bg-card border rounded-lg p-3 space-y-1">
                    <p className="font-medium">{selectedJob.vehicle_year} {selectedJob.vehicle_make} {selectedJob.vehicle_model}</p>
                    {selectedJob.vehicle_color && <p className="text-sm text-muted-foreground">Color: {selectedJob.vehicle_color}</p>}
                    {selectedJob.vehicle_plate && <p className="text-sm text-muted-foreground">Plate: {selectedJob.vehicle_plate}</p>}
                  </div>
                </div>

                {/* Notes */}
                {selectedJob.service_notes && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notes</h4>
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm">{selectedJob.service_notes}</p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-2">
                  {selectedJob.customer_phone && (
                    <Button variant="outline" size="lg" className="h-14 gap-2" onClick={() => callCustomer(selectedJob.customer_phone!)}>
                      <Phone className="h-5 w-5" /> Call
                    </Button>
                  )}
                  {(selectedJob.address || selectedJob.location) && (
                    <Button variant="outline" size="lg" className="h-14 gap-2" onClick={() => openNavigation(selectedJob)}>
                      <Navigation className="h-5 w-5" /> Navigate
                    </Button>
                  )}
                  <Button variant="outline" size="lg" className="h-14 gap-2 col-span-2"
                    onClick={() => window.open(`/messages?appointmentId=${selectedJob.id}`, "_blank")}>
                    <MessageSquare className="h-5 w-5" /> Team Messages
                  </Button>
                </div>
              </div>

              {/* ── Action Footer: Enroute → Arrived → Start Job → Complete Job ── */}
              <div className="border-t p-4 space-y-2 bg-background">
                {selectedFlowStep && selectedNextStatus && (
                  <>
                    {selectedJobStatus === "in_progress" ? (
                      /* Complete Job button */
                      <Button
                        size="lg"
                        className="w-full h-14 text-lg gap-2 bg-gray-600 hover:bg-gray-700"
                        disabled={processing}
                        onClick={() => setConfirmComplete(true)}
                      >
                        {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                        Complete Job
                      </Button>
                    ) : (
                      /* Enroute / Arrived / Start Job */
                      <Button
                        size="lg"
                        className="w-full h-14 text-lg gap-2"
                        disabled={processing}
                        onClick={() => handleStatusUpdate(selectedJob, selectedNextStatus)}
                      >
                        {processing ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          (() => {
                            const Icon = selectedFlowStep.icon;
                            return <Icon className="h-5 w-5" />;
                          })()
                        )}
                        {selectedFlowStep.action}
                        {selectedFlowStep.smsTemplate && (
                          <span className="text-xs opacity-70 ml-2">• notifies customer</span>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirm Complete Dialog */}
      <AlertDialog open={confirmComplete} onOpenChange={setConfirmComplete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Job?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedJob && (
                <>
                  Mark <strong>{selectedJob.service_name}</strong> for{" "}
                  <strong>{selectedJob.customer_name}</strong> as completed?
                  {getJobDuration(selectedJob) && (
                    <span className="block mt-2">Total time: <strong>{getJobDuration(selectedJob)}</strong></span>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={processing}
              onClick={() => selectedJob && handleStatusUpdate(selectedJob, "completed")}
              className="bg-gray-600 hover:bg-gray-700"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Complete Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default MobileDispatchView;
