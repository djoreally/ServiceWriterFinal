/** Real-time technician status against the canonical appointment schema. */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";
import {
  clockInTechnician,
  clockOutTechnician,
  startBreak,
  endBreak,
  markEnRoute,
  markArrived,
  startJob,
} from "@/application/commands/tech-dispatch.command";
import {
  deriveDispatchStatusFromAppointment,
  isClosedDispatchStatus,
  normalizeOperationalTechnicianStatus,
  toLatLng,
  type TechnicianOperationalStatus,
} from "@/lib/dispatch-state";

export interface TechOperationalState {
  technician_id: string;
  status: TechnicianOperationalStatus;
  current_appointment_id: string | null;
  shift_active: boolean;
  location_enabled: boolean;
  current_location: { lat: number; lng: number } | null;
}

export interface RealTimeUpdate {
  type: "job_assigned" | "job_cancelled" | "route_updated" | "urgent_message" | "status_sync";
  action?: "INSERT" | "UPDATE" | "DELETE";
  payload: unknown;
}

function metadataDispatchStatus(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const status = (value as Record<string, unknown>).dispatch_status;
  return typeof status === "string" ? status : undefined;
}

export function useRealTimeTechStatus(technician_id?: string) {
  const [state, setState] = useState<TechOperationalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);

  const fetchTechState = useCallback(async () => {
    if (!technician_id) {
      setLoading(false);
      return;
    }

    try {
      const { data: tech, error: techError } = await supabase
        .from("technicians")
        .select("id,status,current_location,auth_user_id")
        .eq("id", technician_id)
        .maybeSingle();
      if (techError) throw techError;
      if (!tech) {
        setState(null);
        setAssignedUserId(null);
        return;
      }

      const authUserId = tech.auth_user_id ?? null;
      setAssignedUserId(authUserId);

      const [shiftRes, appointmentRes] = await Promise.all([
        supabase
          .from("time_clock_entries")
          .select("id,status")
          .eq("technician_id", technician_id)
          .in("status", ["active", "on_break"])
          .order("clock_in", { ascending: false })
          .limit(1)
          .maybeSingle(),
        authUserId
          ? (supabase as any)
              .from("appointments")
              .select("id,status,metadata,starts_at")
              .eq("assigned_user_id", authUserId)
              .in("status", ["assigned", "acknowledged", "en_route", "arrived", "in_progress"])
              .order("starts_at", { ascending: true })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (shiftRes.error) throw shiftRes.error;
      if (appointmentRes.error) throw appointmentRes.error;

      const shiftActive = !!shiftRes.data;
      const appointment = appointmentRes.data;
      const currentAppointmentId = appointment?.id ?? null;
      const currentDispatchStatus = appointment
        ? deriveDispatchStatusFromAppointment(appointment.status, metadataDispatchStatus(appointment.metadata))
        : undefined;
      const rawLocation = tech.current_location as { lat?: unknown; lng?: unknown } | null;
      const currentLocation = rawLocation ? toLatLng(rawLocation.lat, rawLocation.lng) : null;

      setState({
        technician_id,
        status: normalizeOperationalTechnicianStatus({
          technicianStatus: tech.status,
          shiftActive,
          hasCurrentAppointment: !!currentAppointmentId,
          currentDispatchStatus,
        }),
        current_appointment_id: currentAppointmentId,
        shift_active: shiftActive,
        location_enabled: !!currentLocation,
        current_location: currentLocation,
      });
    } catch (error) {
      console.error("[useRealTimeTechStatus] failed to load technician state", error);
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [technician_id]);

  useEffect(() => {
    void fetchTechState();
  }, [fetchTechState]);

  const handleRealTimeUpdate = useCallback((update: RealTimeUpdate) => {
    void fetchTechState();
    if (update.type === "job_assigned") toast.success("New job assigned!", { description: "Check your Today tab for details" });
    if (update.type === "job_cancelled") toast.info("Job cancelled", { description: "Your schedule has been updated" });
  }, [fetchTechState]);

  useEffect(() => {
    if (!technician_id || !assignedUserId) return;
    const channel = supabase.channel(`tech-dispatch-${technician_id}`);

    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "appointments",
      filter: `assigned_user_id=eq.${assignedUserId}`,
    }, (payload) => {
      const next = (payload.new ?? {}) as { status?: unknown; metadata?: unknown };
      const prev = (payload.old ?? {}) as { status?: unknown; metadata?: unknown };
      const nextDispatch = deriveDispatchStatusFromAppointment(next.status, metadataDispatchStatus(next.metadata));
      const prevDispatch = deriveDispatchStatusFromAppointment(prev.status, metadataDispatchStatus(prev.metadata));
      const type: RealTimeUpdate["type"] = payload.eventType === "INSERT"
        ? "job_assigned"
        : payload.eventType === "DELETE" || (isClosedDispatchStatus(nextDispatch) && !isClosedDispatchStatus(prevDispatch))
          ? "job_cancelled"
          : "status_sync";
      handleRealTimeUpdate({ type, action: payload.eventType as RealTimeUpdate["action"], payload });
    });

    channel.on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "dispatch_events",
      filter: `technician_id=eq.${technician_id}`,
    }, (payload) => handleRealTimeUpdate({ type: "status_sync", payload }));

    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [assignedUserId, handleRealTimeUpdate, technician_id]);

  const transitionToEnRoute = async (appointment_id: string, location?: { lat: number; lng: number }) => {
    if (!technician_id) return;
    await markEnRoute(appointment_id, location);
    await fetchTechState();
    toast.success("En route to job");
  };

  const transitionToArrived = async (appointment_id: string, location?: { lat: number; lng: number }) => {
    if (!technician_id) return;
    await markArrived(appointment_id, location);
    await fetchTechState();
    toast.success("Marked as arrived");
  };

  const transitionToInProgress = async (appointment_id: string) => {
    if (!technician_id) return;
    await startJob(appointment_id);
    await fetchTechState();
    toast.success("Job started");
  };

  const handleClockIn = async (location?: { lat: number; lng: number }) => { await clockInTechnician(location); await fetchTechState(); toast.success("Shift started!"); };
  const handleClockOut = async (location?: { lat: number; lng: number }) => { await clockOutTechnician(location); await fetchTechState(); toast.success("Shift ended"); };
  const handleStartBreak = async () => { await startBreak(); await fetchTechState(); toast.success("Break started!"); };
  const handleEndBreak = async () => { await endBreak(); await fetchTechState(); toast.success("Break ended"); };

  return {
    state,
    loading,
    transitionToEnRoute,
    transitionToArrived,
    transitionToInProgress,
    handleClockIn,
    handleClockOut,
    handleStartBreak,
    handleEndBreak,
    refetch: fetchTechState,
  };
}
