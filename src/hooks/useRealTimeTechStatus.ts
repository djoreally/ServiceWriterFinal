/**
 * Real-time Tech Status Hook — Enterprise dispatch integration
 * 
 * Manages technician operational state with real-time sync:
 * - Shift management (clock in/out, breaks)
 * - Job status transitions (available → en_route → on_job)
 * - Location tracking for dispatch optimization
 * - Real-time notifications from dispatch
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { 
  clockInTechnician,
  clockOutTechnician,
  startBreak,
  endBreak,
  markEnRoute,
  markArrived,
  startJob,
} from '@/application/commands/tech-dispatch.command';
import {
  deriveDispatchStatusFromAppointment,
  isClosedDispatchStatus,
  normalizeOperationalTechnicianStatus,
  toLatLng,
  type TechnicianOperationalStatus,
} from '@/lib/dispatch-state';

export interface TechOperationalState {
  technician_id: string;
  status: TechnicianOperationalStatus;
  current_appointment_id: string | null;
  shift_active: boolean;
  location_enabled: boolean;
  current_location: { lat: number; lng: number } | null;
}

export interface RealTimeUpdate {
  type: 'job_assigned' | 'job_cancelled' | 'route_updated' | 'urgent_message' | 'status_sync';
  action?: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: unknown;
}

export function useRealTimeTechStatus(technician_id?: string) {
  const [state, setState] = useState<TechOperationalState | null>(null);
  const [loading, setLoading] = useState(true);
  // ⚡ Real-time subscription for dispatch events

  // ⚡ Fetch technician operational state
  const fetchTechState = useCallback(async () => {
    if (!technician_id) return;

    try {
      const [techRes, shiftRes, appointmentRes] = await Promise.all([
        supabase
          .from('technicians')
          .select('status, current_location')
          .eq('id', technician_id)
          .single(),
        supabase
          .from('time_clock_entries')
          .select('id, status')
          .eq('technician_id', technician_id)
          .in('status', ['active', 'on_break'])
          .order('clock_in', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('appointments')
          .select('id, status, dispatch_status')
          .eq('assigned_technician_id', technician_id)
          .in('dispatch_status', ['assigned', 'en_route', 'arrived', 'in_progress'])
          .order('scheduled_date', { ascending: true })
          .order('scheduled_time', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      if (techRes.data) {
        const shiftActive = !!shiftRes.data;
        const currentAppointmentId = appointmentRes.data?.id || null;
        const currentDispatchStatus = appointmentRes.data
          ? deriveDispatchStatusFromAppointment(appointmentRes.data.status, appointmentRes.data.dispatch_status)
          : undefined;

        const rawLocation = techRes.data.current_location as { lat?: unknown; lng?: unknown } | null;
        const currentLocation = rawLocation
          ? toLatLng(rawLocation.lat, rawLocation.lng)
          : null;

        setState({
          technician_id,
          status: normalizeOperationalTechnicianStatus({
            technicianStatus: techRes.data.status,
            shiftActive,
            hasCurrentAppointment: !!currentAppointmentId,
            currentDispatchStatus,
          }),
          current_appointment_id: currentAppointmentId,
          shift_active: shiftActive,
          location_enabled: !!currentLocation,
          current_location: currentLocation,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [technician_id]);

  useEffect(() => {
    fetchTechState();
  }, [fetchTechState]);

  const handleRealTimeUpdate = useCallback((update: RealTimeUpdate) => {
    switch (update.type) {
      case 'job_assigned':
        fetchTechState(); // Refresh state
        toast.success('New job assigned!', {
          description: 'Check your Today tab for details',
        });
        break;
      case 'job_cancelled':
        fetchTechState();
        toast.info('Job cancelled', {
          description: 'Your schedule has been updated',
        });
        break;
      case 'status_sync':
        fetchTechState();
        break;
      default:
        fetchTechState();
        break;
    }
  }, [fetchTechState]);

  useEffect(() => {
    if (!technician_id) return;

    // Every callback is attached synchronously BEFORE subscribe(). The
    // previous version awaited getUser() mid-setup; supabase.channel()
    // reuses one channel instance per topic, so a remount during that await
    // returned the already-subscribed channel and .on() threw
    // "cannot add postgres_changes callbacks after subscribe()".
    const channel = supabase.channel(`tech-dispatch-${technician_id}`);

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'appointments',
      filter: `assigned_technician_id=eq.${technician_id}`,
    }, (payload) => {
      const next = (payload.new ?? {}) as { status?: unknown; dispatch_status?: unknown };
      const prev = (payload.old ?? {}) as { status?: unknown; dispatch_status?: unknown };
      const nextDispatch = deriveDispatchStatusFromAppointment(next.status, next.dispatch_status);
      const prevDispatch = deriveDispatchStatusFromAppointment(prev.status, prev.dispatch_status);

      const updateType: RealTimeUpdate['type'] =
        payload.eventType === 'INSERT'
          ? 'job_assigned'
          : payload.eventType === 'DELETE' ||
              (isClosedDispatchStatus(nextDispatch) && !isClosedDispatchStatus(prevDispatch))
            ? 'job_cancelled'
            : 'status_sync';

      console.info('⚡ Real-time appointment update:', payload);
      handleRealTimeUpdate({
        type: updateType,
        action: payload.eventType as RealTimeUpdate['action'],
        payload,
      });
    });

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dispatch_events',
      filter: `technician_id=eq.${technician_id}`,
    }, (payload) => {
      console.info('⚡ Real-time dispatch event:', payload);
      handleRealTimeUpdate({ type: 'status_sync', payload });
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [handleRealTimeUpdate, technician_id]);

  // ⚡ Enterprise-level status transition methods
  const transitionToEnRoute = async (appointment_id: string, location?: { lat: number; lng: number }) => {
    if (!technician_id) return;
    await markEnRoute(appointment_id, location);
    await fetchTechState();
    toast.success('En route to job');
  };

  const transitionToArrived = async (appointment_id: string, location?: { lat: number; lng: number }) => {
    if (!technician_id) return;
    await markArrived(appointment_id, location);
    await fetchTechState();
    toast.success('Marked as arrived');
  };

  const transitionToInProgress = async (appointment_id: string) => {
    if (!technician_id) return;
    await startJob(appointment_id);
    await fetchTechState();
    toast.success('Job started');
  };

  const handleClockIn = async (location?: { lat: number; lng: number }) => {
    await clockInTechnician(location);
    await fetchTechState();
    toast.success('Shift started!');
  };

  const handleClockOut = async (location?: { lat: number; lng: number }) => {
    await clockOutTechnician(location);
    await fetchTechState();
    toast.success('Shift ended');
  };

  const handleStartBreak = async () => {
    await startBreak();
    await fetchTechState();
    toast.success('Break started');
  };

  const handleEndBreak = async () => {
    await endBreak();
    await fetchTechState();
    toast.success('Break ended');
  };

  return {
    state,
    loading,
    // Enterprise status transitions
    transitionToEnRoute,
    transitionToArrived,
    transitionToInProgress,
    // Shift management
    handleClockIn,
    handleClockOut,
    handleStartBreak,
    handleEndBreak,
    // Data refresh
    refetch: fetchTechState,
  };
}
