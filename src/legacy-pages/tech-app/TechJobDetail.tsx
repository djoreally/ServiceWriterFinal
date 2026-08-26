import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TechPartsCard } from "@/components/parts/TechPartsCard";
import { VehicleFilterMatchCard } from "@/components/vehicles/VehicleFilterMatchCard";
import { AppointmentConfigurationSummary } from "@/components/booking/AppointmentConfigurationSummary";
import { OilResetProcedureCard } from "@/components/vehicles/OilResetProcedureCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Navigation, Phone, Car, Wrench, User, Clock,
  Play, AlertTriangle, Camera, MessageSquare, Copy, CircleDot, Save, Send,
  Upload, Check, X, Image, Mail,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { formatTimeLabel, formatDateLabel } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { fetchTechJobDetailBundle, fetchTechnicianJobWorkspaceV2, type JobExecutionStep } from "@/application/queries/tech-app.query";
import { JobExecutionChecklist } from "@/components/tech-app/JobExecutionChecklist";
import {
  saveTechJobNotes,
  saveTechRecommendation,
  sendTechnicianEtaEmail,

  updateTechJobDispatchStatus,
  uploadTechJobPhoto,
} from "@/application/commands/tech-app.command";
import { useTechJobEta } from "@/hooks/useTechJobEta";
import { toast } from "@/components/ui/sonner";
import { getTechPrimaryAction } from "@/lib/tech-mission-board";
import { fetchJobThreadTimeline, type JobThreadTimelineItem } from "@/application/queries/job-thread.query";
import { createJobThreadException, sendJobThreadHumanMessage } from "@/application/commands/job-thread.command";
import { queueJobThreadMessage } from "@/offline/outbox";

interface JobDetail {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  estimated_duration_minutes: number;
  dispatch_status: string;
  job_priority: string;
  status: string;
  location_address: string | null;
  notes: string | null;
  dispatch_notes: string | null;
  estimated_cost: number | null;
  payment_status: string | null;
  user_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  customers: { name: string; phone: string | null; email: string | null } | null;
  vehicles: { year: number; make: string; model: string; color: string | null; vin: string | null; license_plate: string | null } | null;
  service_catalog: { name: string } | null;
  technicians: { name: string; id: string } | null;
  vans: { name: string } | null;
}

interface AppointmentService {
  id: string;
  name: string;
  price: number;
  quantity: number;
  is_prepaid: boolean;
}

interface JobPhoto {
  id: string;
  photo_type: string;
  storage_path: string;
  file_name: string | null;
  created_at: string;
}

const STATUS_ORDER = [
  "assigned",
  "en_route",
  "arrived",
  "waiting_customer",
  "in_progress",
  "waiting_issue",
  "ready_review",
  "completed",
] as const;

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned",
  en_route: "En Route",
  arrived: "Arrived",
  waiting_customer: "Waiting for Customer",
  in_progress: "In Service",
  waiting_issue: "Waiting on Issue",
  ready_review: "Ready for Review",
  completed: "Completed",
  could_not_complete: "Could Not Complete",
};

const COULD_NOT_COMPLETE_REASONS = [
  "Customer no show",
  "Unsafe work area",
  "Wrong parts",
  "Vehicle issue beyond scope",
  "Weather delay",
  "Payment failure",
  "Authorization missing",
];

const QUICK_CUSTOMER_UPDATES = [
  { label: "On the Way", text: "I'm on the way." },
  { label: "Arrived", text: "I've arrived at your location." },
  { label: "Need Access", text: "I need access to the vehicle to begin service." },
  { label: "Issue Found", text: "I found an issue that may affect completion. Please call me." },
  { label: "Delay", text: "Running behind due to prior job. Updated ETA coming soon." },
];

const URGENCY_OPTIONS = ["high", "medium", "low"] as const;
const THREAD_EXCEPTION_TYPES = [
  "customer_not_present",
  "wrong_vehicle",
  "missing_parts",
  "access_issue",
  "safety_issue",
  "other",
] as const;

// Photo types with metadata
const PHOTO_TYPES = [
  { type: "before", label: "Before", required: true },
  { type: "damage", label: "Damage/Issue", required: false },
  { type: "completion", label: "Completion", required: true },
  { type: "signature", label: "Signature", required: false },
] as const;

export default function TechJobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [processing, setProcessing] = useState(false);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [services, setServices] = useState<AppointmentService[]>([]);
  const [techNotes, setTechNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  
  // Photo state
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activePhotoType, setActivePhotoType] = useState<string | null>(null);
  
  // Recommendation state
  const [recService, setRecService] = useState("");
  const [recCost, setRecCost] = useState("");
  const [recUrgency, setRecUrgency] = useState<string>("medium");
  const [recNotes, setRecNotes] = useState("");
  const [savingRec, setSavingRec] = useState(false);
  
  const [showIncompleteDialog, setShowIncompleteDialog] = useState(false);
  const [selectedFailureReason, setSelectedFailureReason] = useState<string | null>(null);
  const [timelineItems, setTimelineItems] = useState<JobThreadTimelineItem[]>([]);
  const [executionSteps, setExecutionSteps] = useState<JobExecutionStep[]>([]);
  const [threadMessage, setThreadMessage] = useState("");
  const [threadExceptionType, setThreadExceptionType] = useState<string>("customer_not_present");
  const [threadExceptionNote, setThreadExceptionNote] = useState("");

  const fetchData = useCallback(async () => {
    if (!jobId) {
      setLoadError("No work order was specified.");
      setLoading(false);
      return;
    }

    try {
      const {
        job: jobDataRaw,
        jobError,
        services: servicesData,
        photos: photosData,
      } = await fetchTechJobDetailBundle(jobId);

      if (jobError || !jobDataRaw) {
        setLoadError("This work order could not be loaded. It may no longer be assigned to you.");
        return;
      }

      const jobData = jobDataRaw as unknown as JobDetail;
      setLoadError(null);
      setJob(jobData);
      setTechNotes(jobData.notes || "");
      setPhotos((photosData || []) as unknown as JobPhoto[]);

      const parsedServices: AppointmentService[] = (servicesData || []).map((s: any) => ({
        id: s.id,
        name: s.service_catalog?.name || "Service",
        price: s.service_catalog?.price || 0,
        quantity: s.quantity || 1,
        is_prepaid: !!s.is_prepaid,
      }));

      setServices(parsedServices);

      try {
        const workspace = await fetchTechnicianJobWorkspaceV2(jobData.id);
        setExecutionSteps(workspace.checklist ?? []);
      } catch {
        setExecutionSteps([]);
      }

      try {
        const timeline = await fetchJobThreadTimeline(
          jobData.id,
          (jobData as any).is_fleet ? "fleet_work_order" : "appointment",
        );
        setTimelineItems(timeline);
      } catch {
        setTimelineItems([]);
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "This work order could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ⚡ Use RPC for status updates (creates audit trail in dispatch_events)
  const updateStatus = async (nextStatus: string, failureReason?: string) => {
    if (!job) return;

    if (nextStatus === "completed" && !(job as any).is_fleet) {
      const requiredPhotoTypes = PHOTO_TYPES.filter((p) => p.required).map((p) => p.type);
      const uploadedTypes = new Set(photos.map((p) => p.photo_type));
      const missingRequiredEvidence = requiredPhotoTypes.filter((photoType) => !uploadedTypes.has(photoType));
      if (missingRequiredEvidence.length > 0) {
        toast.error(`Completion blocked: missing required evidence (${missingRequiredEvidence.join(", ")})`);
        return;
      }
    }

    setProcessing(true);

    const { error } = await updateTechJobDispatchStatus(
      job.id,
      nextStatus,
      failureReason,
      (job as any).is_fleet
    );

    if (error) {
      console.error("[TechJobDetail] RPC error:", error);
      toast.error("Failed to update status");
    } else {
      toast.success(`Status set to ${STATUS_LABELS[nextStatus] || nextStatus}`);
      setJob({ ...job, dispatch_status: nextStatus });
    }

    setProcessing(false);
  };

  const advanceStatus = () => {
    if (!job) return;
    const currentIndex = STATUS_ORDER.indexOf(job.dispatch_status as (typeof STATUS_ORDER)[number]);
    const next = currentIndex >= 0 && currentIndex < STATUS_ORDER.length - 1 ? STATUS_ORDER[currentIndex + 1] : null;
    if (!next) return;
    updateStatus(next);
  };

  const handleCouldNotComplete = (reason: string | null) => {
    updateStatus("could_not_complete", reason ? `Could Not Complete: ${reason}` : undefined);
    setShowIncompleteDialog(false);
    setSelectedFailureReason(null);
  };

  const sendThreadMessage = async () => {
    if (!job || !threadMessage.trim()) return;
    const { error } = await sendJobThreadHumanMessage({
      jobId: job.id,
      jobSource: (job as any).is_fleet ? "fleet_work_order" : "appointment",
      content: threadMessage.trim(),
      senderRole: "technician",
    });
    if (error) {
      toast.error("Failed to send thread message");
      return;
    }
    setThreadMessage("");
    const timeline = await fetchJobThreadTimeline(job.id, (job as any).is_fleet ? "fleet_work_order" : "appointment");
    setTimelineItems(timeline);
    toast.success("Message added to job thread");
  };

  const logThreadException = async () => {
    if (!job) return;
    const { error } = await createJobThreadException({
      jobId: job.id,
      jobSource: (job as any).is_fleet ? "fleet_work_order" : "appointment",
      exceptionType: threadExceptionType as any,
      note: threadExceptionNote.trim() || undefined,
    });
    if (error) {
      toast.error("Failed to log exception");
      return;
    }
    setThreadExceptionNote("");
    const timeline = await fetchJobThreadTimeline(job.id, (job as any).is_fleet ? "fleet_work_order" : "appointment");
    setTimelineItems(timeline);
    toast.success("Exception logged to thread");
  };

  /** Opens in-app turn-by-turn guidance; the external maps link stays as a manual fallback. */
  const handleNavigate = () => {
    if (!job) return;
    navigate(`/tech-app/navigate/${job.id}`);
  };

  const handleCall = () => {
    if (!job?.customers?.phone) return;
    window.location.href = `tel:${job.customers.phone}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  // ⚡ Photo upload to storage + metadata
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !job || !activePhotoType) return;

    setUploadingType(activePhotoType);

    try {
      const { data: photoRecord, error } = await uploadTechJobPhoto({
        appointmentId: job.id,
        businessUserId: job.user_id,
        photoType: activePhotoType,
        isRequired: PHOTO_TYPES.find((p) => p.type === activePhotoType)?.required || false,
        file,
      });

      if (error || !photoRecord) {
        throw error || new Error("Failed to create photo record");
      }

      setPhotos(prev => [photoRecord as unknown as JobPhoto, ...prev]);
      toast.success(`${activePhotoType} photo uploaded`);
    } catch (err) {
      console.error("[TechJobDetail] Photo upload error:", err);
      toast.error("Failed to upload photo");
    } finally {
      setUploadingType(null);
      setActivePhotoType(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const triggerPhotoUpload = (photoType: string) => {
    setActivePhotoType(photoType);
    fileInputRef.current?.click();
  };

  const getPhotoCountByType = (type: string) => {
    return photos.filter(p => p.photo_type === type).length;
  };

  // Live traffic ETA for this job (shared with the dashboard mission card).
  const jobEta = useTechJobEta(
    job ? { lat: (job as any).location_lat ?? null, lng: (job as any).location_lng ?? null, address: job.location_address } : null,
  );
  const [etaSending, setEtaSending] = useState(false);

  // ⚡ Email the customer a shop-branded ETA update (live traffic based)
  const emailCustomerEta = async () => {
    if (!job || etaSending) return;
    if ((job as any).is_fleet) {
      toast.error("Fleet work orders have no customer email");
      return;
    }
    setEtaSending(true);
    try {
      const { deduped } = await sendTechnicianEtaEmail({
        appointmentId: job.id,
        etaMinutes: jobEta.durationMinutes,
        etaLabel: jobEta.etaLabel,
        distanceMiles: jobEta.distanceMiles,
      });
      toast.success(deduped ? "ETA already sent moments ago" : "ETA emailed to the customer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to email the ETA");
    } finally {
      setEtaSending(false);
    }
  };

  // Customer updates are recorded in the job thread and delivered by the
  // server-side dispatcher — never sent straight from the device.
  const sendCustomerMessage = async (text: string) => {
    if (!job?.customers?.phone || !job.id) {
      toast.error("No customer phone number");
      return;
    }

    const clientMessageId = crypto.randomUUID();

    try {
      const { error } = await sendJobThreadHumanMessage({
        jobId: job.id,
        jobSource: (job as any).is_fleet ? "fleet_work_order" : "appointment",
        content: text,
        senderRole: "technician",
        channel: "customer_sms",
        recipient: job.customers.phone,
        clientMessageId,
      });

      if (error) throw new Error(error);
      toast.success("Update queued for the customer");
      const timeline = await fetchJobThreadTimeline(job.id, (job as any).is_fleet ? "fleet_work_order" : "appointment");
      setTimelineItems(timeline);
    } catch (err) {
      // Offline or transient failure: queue it so the update is never silently lost.
      const queued = await queueJobThreadMessage({
        jobId: job.id,
        jobSource: (job as any).is_fleet ? "fleet_work_order" : "appointment",
        content: text,
        channel: "customer_sms",
        recipient: job.customers.phone,
        clientMessageId,
      });
      if (queued) {
        toast.success("Saved — will send when you're back online");
        return;
      }
      console.error("[TechJobDetail] customer message failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    }
  };


  // ⚡ Save technician notes to appointments.notes
  const saveTechNotes = async () => {
    if (!job) return;

    const { error } = await saveTechJobNotes(job.id, techNotes, (job as any).is_fleet);

    if (error) {
      toast.error("Failed to save notes");
    } else {
      toast.success("Notes saved");
      setNotesSaved(true);
    }
  };

  // ⚡ Save recommendation to declined_services table
  const saveRecommendation = async () => {
    if (!job || !recService.trim()) {
      toast.error("Please enter a service name");
      return;
    }

    setSavingRec(true);

    const { error } = await saveTechRecommendation({
      userId: job.user_id,
      customerId: job.customer_id,
      vehicleId: job.vehicle_id,
      appointmentId: job.id,
      recommendedService: recService.trim(),
      estimatedCost: recCost ? parseFloat(recCost) : null,
      urgency: recUrgency,
      notes: recNotes.trim() || null,
    });

    if (error) {
      console.error("[TechJobDetail] Recommendation error:", error);
      toast.error("Failed to save recommendation");
    } else {
      toast.success("Recommendation saved");
      setRecService("");
      setRecCost("");
      setRecUrgency("medium");
      setRecNotes("");
    }

    setSavingRec(false);
  };

  const totalPrice = services.reduce((sum, s) => sum + s.price * s.quantity, 0);
  const prepaidAmount = services.filter((s) => s.is_prepaid).reduce((sum, s) => sum + s.price * s.quantity, 0);
  const balanceDue = totalPrice - prepaidAmount;

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="space-y-4 p-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/tech-app")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to today
        </Button>
        {!(job as any).is_fleet && <AppointmentConfigurationSummary appointmentId={job.id} />}
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="font-semibold">Work order unavailable</p>
            <p className="text-sm text-muted-foreground">
              {loadError || "Work order not found."}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                fetchData();
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }


  const activeIndex = STATUS_ORDER.indexOf(job.dispatch_status as (typeof STATUS_ORDER)[number]);
  const primaryAction = getTechPrimaryAction(job as any, true);
  const requiredPhotoTypes = PHOTO_TYPES.filter((p) => p.required).map((p) => p.type);
  const uploadedTypes = new Set(photos.map((p) => p.photo_type));
  const missingEvidence = !(job as any).is_fleet ? requiredPhotoTypes.filter((photoType) => !uploadedTypes.has(photoType)) : [];
  const hasOpenThreadExceptions = timelineItems.some((item) => item.item_type === "exception");

  return (
    <div className="flex flex-col h-full">
      {/* Hidden file input for photo capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      <div className="sticky top-0 bg-background z-10 p-4 border-b flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app/jobs")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="font-semibold">{job.customers?.name || "Work Order"}</h1>
          <p className="text-xs text-muted-foreground">
            {formatDateLabel(job.scheduled_date, "MMM d")} • {formatTimeLabel(job.scheduled_time, "h:mm a")}
          </p>
        </div>
        <Badge variant="outline">{STATUS_LABELS[job.dispatch_status] || job.dispatch_status}</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-36 space-y-4">
        <Card>
          <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-muted-foreground text-xs">Job ID</p><p className="font-medium">{job.id.slice(0, 8)}</p></div>
            <div><p className="text-muted-foreground text-xs">Van</p><p className="font-medium">{job.vans?.name || "Unassigned"}</p></div>
            <div><p className="text-muted-foreground text-xs">Service Type</p><p className="font-medium">{job.service_catalog?.name || "Service"}</p></div>
            <div><p className="text-muted-foreground text-xs">Est. Duration</p><p className="font-medium">{job.estimated_duration_minutes || 60} min</p></div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={handleNavigate}><Navigation className="h-4 w-4 mr-2" />Navigate</Button>
          <Button variant="outline" onClick={handleCall}><Phone className="h-4 w-4 mr-2" />Call</Button>
        </div>
        {job.location_address && (
          <div className="text-center">
            <a
              className="text-xs text-muted-foreground underline"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.location_address)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Maps instead
            </a>
          </div>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Job Lifecycle</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {STATUS_ORDER.map((status, idx) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <CircleDot className={cn("h-4 w-4", idx <= activeIndex ? "text-primary" : "text-muted-foreground/40")} />
                <span className={cn(idx <= activeIndex ? "text-foreground font-medium" : "text-muted-foreground")}>{STATUS_LABELS[status]}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" />Customer & Location</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{job.customers?.name || "Customer"}</p>
            {job.customers?.phone && <p className="text-primary">{job.customers.phone}</p>}
            {job.location_address && <p className="text-muted-foreground">{job.location_address}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Car className="h-4 w-4" />Vehicle Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{job.vehicles ? `${job.vehicles.year} ${job.vehicles.make} ${job.vehicles.model}` : "Vehicle TBD"}</p>
            {job.vehicles?.license_plate && <p>Plate: <span className="font-mono">{job.vehicles.license_plate}</span></p>}
            {job.vehicles?.vin && (
              <p className="flex items-center gap-2">VIN: <span className="font-mono text-xs">{job.vehicles.vin}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(job.vehicles!.vin!)}><Copy className="h-3 w-3" /></Button></p>
            )}
          </CardContent>
        </Card>

        <TechPartsCard vehicleId={job.vehicle_id} />

        <VehicleFilterMatchCard
          title="Filter match"
          year={job.vehicles?.year}
          make={job.vehicles?.make}
          model={job.vehicles?.model}
          vehicleKind="retail"
          vehicleId={job.vehicle_id}
          allowConfirm
        />

        <OilResetProcedureCard
          year={job.vehicles?.year}
          make={job.vehicles?.make}
          model={job.vehicles?.model}
        />



        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />Services Ordered</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {services.map((service) => (
              <div key={service.id} className="flex items-center justify-between">
                <span>{service.name} {service.quantity > 1 ? `x${service.quantity}` : ""}</span>
                <span className="font-medium">${(service.price * service.quantity).toFixed(2)}</span>
              </div>
            ))}
            <div className="border-t pt-2 space-y-1">
              <p className="flex justify-between"><span>Total</span><span>${totalPrice.toFixed(2)}</span></p>
              <p className="flex justify-between text-primary"><span>Deposit Paid</span><span>${prepaidAmount.toFixed(2)}</span></p>
              <p className="flex justify-between font-semibold"><span>Balance Due</span><span>${balanceDue.toFixed(2)}</span></p>
            </div>
          </CardContent>
        </Card>

        {/* Retail evidence is appointment-backed; Fleet evidence requires its own Phase 3 contract. */}
        {!(job as any).is_fleet && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" />Photo Documentation</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {PHOTO_TYPES.map((photoType) => {
              const count = getPhotoCountByType(photoType.type);
              const isUploading = uploadingType === photoType.type;
              const hasPhotos = count > 0;
              
              return (
                <button
                  key={photoType.type}
                  onClick={() => triggerPhotoUpload(photoType.type)}
                  disabled={isUploading}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    "hover:bg-accent/50 active:bg-accent",
                    hasPhotos && "border-primary/50 bg-primary/5"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-xs">{photoType.label}</p>
                    {isUploading ? (
                      <Upload className="h-4 w-4 animate-pulse text-primary" />
                    ) : hasPhotos ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {isUploading ? "Uploading..." : `${count} uploaded`}
                  </p>
                  {photoType.required && !hasPhotos && (
                    <Badge variant="destructive" className="mt-1 text-[10px]">Required</Badge>
                  )}
                  {hasPhotos && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      <Image className="h-2 w-2 mr-1" />{count}
                    </Badge>
                  )}
                </button>
              );
            })}
          </CardContent>
        </Card>}

        {/* Customer Communication - Now sends SMS */}
        {!(job as any).is_fleet && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="h-4 w-4" />Send Customer Update</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full justify-start text-xs h-auto py-2"
              onClick={emailCustomerEta}
              disabled={etaSending}
            >
              <Mail className="h-3 w-3 mr-2" />
              {etaSending
                ? "Sending ETA…"
                : jobEta.etaLabel
                  ? `Email ETA to customer (${jobEta.etaLabel})`
                  : "Email ETA to customer"}
            </Button>
            {QUICK_CUSTOMER_UPDATES.map((template) => (
              <Button
                key={template.label}
                variant="outline"
                className="w-full justify-start text-xs h-auto py-2"
                onClick={() =>
                  sendCustomerMessage(
                    template.label === "On the Way" && jobEta.durationMinutes != null
                      ? `I'm on the way. ETA about ${Math.round(jobEta.durationMinutes)} minutes.`
                      : template.text,
                  )
                }
                disabled={!job.customers?.phone}
              >
                <Send className="h-3 w-3 mr-2" />
                {template.label}
              </Button>
            ))}
            {!job.customers?.phone && (
              <p className="text-xs text-muted-foreground">No phone number on file</p>
            )}
          </CardContent>
        </Card>}

        {/* Recommendations - Persisted to declined_services */}
        {!(job as any).is_fleet && <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Add Recommendation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Service Name *</Label>
              <Input
                placeholder="e.g., Brake Pad Replacement"
                value={recService}
                onChange={(e) => setRecService(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Est. Cost</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={recCost}
                  onChange={(e) => setRecCost(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Urgency</Label>
                <Select value={recUrgency} onValueChange={setRecUrgency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {URGENCY_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                placeholder="Additional details for the customer..."
                value={recNotes}
                onChange={(e) => setRecNotes(e.target.value)}
                className="min-h-[60px]"
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={saveRecommendation}
              disabled={savingRec || !recService.trim()}
            >
              <Save className="h-4 w-4 mr-2" />
              {savingRec ? "Saving..." : "Save Recommendation"}
            </Button>
          </CardContent>
        </Card>}

        {/* Technician Notes - Persisted to appointments.notes */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" />Technician Notes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="Internal notes about this job..."
              value={techNotes}
              onChange={(e) => {
                setTechNotes(e.target.value);
                setNotesSaved(false);
              }}
              className="min-h-[80px]"
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={saveTechNotes}
              disabled={notesSaved}
            >
              <Save className="h-4 w-4 mr-2" />
              {notesSaved ? "Notes Saved" : "Save Notes"}
            </Button>
          </CardContent>
        </Card>

        {job.dispatch_status === "completed" && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Check className="h-4 w-4" />End-of-Job Review</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-muted-foreground">Final status</span><span className="font-medium">Completed</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Evidence captured</span><span className="font-medium">{photos.length} file{photos.length === 1 ? "" : "s"}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Parts/services reviewed</span><span className="font-medium">{services.length} item{services.length === 1 ? "" : "s"}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Open exceptions</span><span className={cn("font-medium", hasOpenThreadExceptions && "text-destructive")}>{hasOpenThreadExceptions ? "Review thread" : "None"}</span></p>
              <Button className="w-full" onClick={() => navigate("/tech-app")}>Return to Mission Board</Button>
            </CardContent>
          </Card>
        )}

        <JobExecutionChecklist
          jobId={job.id}
          businessUserId={job.user_id}
          steps={executionSteps}
          onChanged={fetchData}
        />

        {job.dispatch_notes && (
          <Card className="bg-accent/40">
            <CardContent className="p-3 text-sm">
              <p className="font-medium">Dispatch Notes</p>
              <p className="text-muted-foreground">{job.dispatch_notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Job Communication Thread
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-72 overflow-y-auto rounded border p-2 bg-muted/20">
              {timelineItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">No thread entries yet.</p>
              ) : timelineItems.map((item) => (
                <div key={`${item.item_type}-${item.id}`} className="rounded border p-2 bg-background">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant={item.item_type === "exception" ? "destructive" : item.item_type === "system_event" ? "secondary" : "outline"} className="text-[10px]">
                      {item.item_type === "human_message" ? "Message" : item.item_type === "system_event" ? "System Event" : "Exception"}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{format(parseISO(item.created_at), "MMM d, h:mm a")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground break-words">
                    {item.item_type === "human_message"
                      ? String(item.payload.content ?? "")
                      : item.item_type === "system_event"
                        ? String(item.payload.event_type ?? "event")
                        : `${String(item.payload.exception_type ?? "exception")}${item.payload.note ? ` — ${String(item.payload.note)}` : ""}`}
                  </p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Send Message</Label>
              <Textarea value={threadMessage} onChange={(e) => setThreadMessage(e.target.value)} placeholder="Send job-context message to dispatch..." />
              <Button variant="outline" className="w-full" onClick={sendThreadMessage} disabled={!threadMessage.trim()}>
                <Send className="h-4 w-4 mr-2" />Send to Thread
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Log Structured Exception</Label>
              <Select value={threadExceptionType} onValueChange={setThreadExceptionType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {THREAD_EXCEPTION_TYPES.map((exceptionType) => (
                    <SelectItem key={exceptionType} value={exceptionType}>{exceptionType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={threadExceptionNote} onChange={(e) => setThreadExceptionNote(e.target.value)} placeholder="Optional exception note..." />
              <Button variant="destructive" className="w-full" onClick={logThreadException}>
                <AlertTriangle className="h-4 w-4 mr-2" />Log Exception
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {job.dispatch_status !== "completed" && job.dispatch_status !== "could_not_complete" && (
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t safe-area-pb space-y-2">
          {missingEvidence.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              Completion blocked until required evidence is captured: {missingEvidence.join(", ")}.
            </div>
          )}
          <Button className="w-full h-12" onClick={() => primaryAction.targetStatus ? updateStatus(primaryAction.targetStatus) : advanceStatus()} disabled={processing}>
            <Play className="h-5 w-5 mr-2" />{primaryAction.targetStatus ? primaryAction.label : "Open Job"}
          </Button>
          <Button variant="destructive" className="w-full h-11" onClick={() => setShowIncompleteDialog(true)}>
            <AlertTriangle className="h-4 w-4 mr-2" />Could Not Complete
          </Button>
        </div>
      )}

      <AlertDialog open={showIncompleteDialog} onOpenChange={setShowIncompleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Could not complete job</AlertDialogTitle>
            <AlertDialogDescription>Select a reason to log structured failure data.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid grid-cols-1 gap-2">
            {COULD_NOT_COMPLETE_REASONS.map((reason) => (
              <Button
                key={reason}
                variant={selectedFailureReason === reason ? "default" : "outline"}
                className="justify-start"
                onClick={() => setSelectedFailureReason(reason)}
              >
                {reason}
              </Button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedFailureReason(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleCouldNotComplete(selectedFailureReason)}>
              {selectedFailureReason ? "Save with Reason" : "Save without Reason"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
