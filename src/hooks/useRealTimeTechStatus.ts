/** Real-time technician status against canonical workspace membership, presence, and appointment state.
 *
 * Phase 2: the membership/presence/appointment reads go through the typed API
 * client (`@/lib/api-client`) to `GET /v1/dispatch/technician-state`. Change
 * detection polls the same endpoint — there is no apiClient equivalent for
 * realtime channels. A new current appointment surfaces the "New job assigned"
 * toast; with polling a cancellation is indistinguishable from a normal
 * completion, so no cancelled toast is fired.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
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
    if (!technician_id) { setLoading(false); return; }
    const workspaceId = getSelectedWorkspaceId();
    if (!workspaceId) { setState(null); setLoading(false); return; }

    try {
      const response = await apiClient.get<{
        data: {
          member: { user_id: string; role: string; is_active: boolean } | null;
          presence: {
            status: string;
            current_location: { lat?: unknown; lng?: unknown } | null;
            current_appointment_id: string | null;
            clocked_in_at: string | null;
          } | null;
          appointments: Array<{ id: string; status: string; metadata: unknown; starts_at: string }>;
        };
      }>("/v1/dispatch/technician-state", { query: { technician_id } });
      const member = response.data.member;
      const presence = response.data.presence;
      if (!member) { setState(null); setAssignedUserId(null); return; }

      setAssignedUserId(technician_id);
      const appointments = response.data.appointments ?? [];
      const appointment = appointments.find((row) => {
        const dispatch = deriveDispatchStatusFromAppointment(row.status, metadataDispatchStatus(row.metadata));
        return dispatch === "in_progress" || dispatch === "arrived" || dispatch === "en_route" || dispatch === "acknowledged" || dispatch === "assigned";
      }) ?? null;
      const currentAppointmentId = presence?.current_appointment_id ?? appointment?.id ?? null;
      const currentDispatchStatus = appointment
        ? deriveDispatchStatusFromAppointment(appointment.status, metadataDispatchStatus(appointment.metadata))
        : undefined;
      const rawLocation = presence?.current_location as { lat?: unknown; lng?: unknown } | null;
      const currentLocation = rawLocation ? toLatLng(rawLocation.lat, rawLocation.lng) : null;
      const shiftActive = !!presence?.clocked_in_at;

      setState({
        technician_id,
        status: normalizeOperationalTechnicianStatus({
          technicianStatus: presence?.status ?? "offline",
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

  useEffect(() => { void fetchTechState(); }, [fetchTechState]);

  // Poll the technician state; the "new job assigned" toast fires when a
  // current appointment appears that was not there on the previous poll.
  const prevAppointmentIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const prev = prevAppointmentIdRef.current;
    const next = state?.current_appointment_id ?? null;
    if (prev !== undefined && prev !== next && prev === null && next !== null) {
      toast.success("New job assigned!", { description: "Check your Today tab for details" });
    }
    prevAppointmentIdRef.current = next;
  }, [state]);

  useEffect(() => {
    if (!technician_id || !assignedUserId) return;
    const workspaceId = getSelectedWorkspaceId();
    if (!workspaceId) return;
    const timer = setInterval(() => {
      void fetchTechState();
    }, 20_000);
    return () => { clearInterval(timer); };
  }, [assignedUserId, fetchTechState, technician_id]);

  const transitionToEnRoute = async (appointment_id: string, location?: { lat: number; lng: number }) => { if (!technician_id) return; await markEnRoute(appointment_id, location); await fetchTechState(); toast.success("En route to job"); };
  const transitionToArrived = async (appointment_id: string, location?: { lat: number; lng: number }) => { if (!technician_id) return; await markArrived(appointment_id, location); await fetchTechState(); toast.success("Marked as arrived"); };
  const transitionToInProgress = async (appointment_id: string) => { if (!technician_id) return; await startJob(appointment_id); await fetchTechState(); toast.success("Job started"); };
  const handleClockIn = async (location?: { lat: number; lng: number }) => { await clockInTechnician(location); await fetchTechState(); toast.success("Shift started!"); };
  const handleClockOut = async (location?: { lat: number; lng: number }) => { await clockOutTechnician(location); await fetchTechState(); toast.success("Shift ended"); };
  const handleStartBreak = async () => { await startBreak(); await fetchTechState(); toast.success("Break started!"); };
  const handleEndBreak = async () => { await endBreak(); await fetchTechState(); toast.success("Break ended"); };

  return { state, loading, transitionToEnRoute, transitionToArrived, transitionToInProgress, handleClockIn, handleClockOut, handleStartBreak, handleEndBreak, refetch: fetchTechState };
}
