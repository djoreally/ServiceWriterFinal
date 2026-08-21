/**
 * Tech Dispatch Commands — Application layer for technician dispatch operations
 * 
 * Abstracts dispatch logic from UI components for enterprise-level architecture
 */

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface TechStatusUpdate {
  technician_id: string;
  new_status: 'available' | 'en_route' | 'on_job' | 'on_break' | 'unavailable' | 'offline';
  appointment_id?: string;
  location?: { lat: number; lng: number };
}

export interface DispatchNotification {
  type: 'job_assigned' | 'job_updated' | 'job_cancelled' | 'route_optimized' | 'urgent_message';
  technician_id: string;
  appointment_id?: string;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Update technician operational status
 * Triggers: Status badge changes, location updates, dispatch events
 */
export async function updateTechnicianStatus(update: TechStatusUpdate): Promise<any> {
  return supabase.functions.invoke('tech-dispatch-sync', {
    body: {
      action: 'update_tech_status',
      data: update,
    },
  });
}

/**
 * Send dispatch notification to technician
 * Triggers: Job assignment, route changes, urgent messages
 */
export async function sendDispatchNotification(notification: DispatchNotification): Promise<any> {
  return supabase.functions.invoke('tech-dispatch-sync', {
    body: {
      action: 'dispatch_notification',
      data: notification,
    },
  });
}

/**
 * Sync daily workload for capacity planning
 * Triggers: Job assignment, completion, cancellation
 */
export async function syncTechnicianDailyLoad(technician_id: string, date: string): Promise<any> {
  return supabase.functions.invoke('tech-dispatch-sync', {
    body: {
      action: 'sync_daily_load',
      data: { technician_id, date },
    },
  });
}

/**
 * Update technician real-time location
 * Triggers: GPS location updates from mobile app
 */
export async function updateTechnicianLocation(
  technician_id: string, 
  location: { lat: number; lng: number }
): Promise<any> {
  return supabase.functions.invoke('tech-dispatch-sync', {
    body: {
      action: 'update_location',
      data: { technician_id, location },
    },
  });
}

/**
 * Start technician shift (clock in)
 * Server-side RPC ensures data integrity
 */
export async function clockInTechnician(location?: { lat: number; lng: number }): Promise<any> {
  return supabase.rpc('clock_in', { 
    p_location: location ? JSON.stringify(location) : null 
  });
}

/**
 * End technician shift (clock out)
 * Server-side RPC calculates hours and updates status
 */
export async function clockOutTechnician(location?: { lat: number; lng: number }): Promise<any> {
  return supabase.rpc('clock_out', { 
    p_location: location ? JSON.stringify(location) : null 
  });
}

/**
 * Start break during active shift
 */
export async function startBreak(): Promise<any> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');

  // Get active shift
  const { data: shift } = await supabase
    .from('time_clock_entries')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('clock_in', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!shift) throw new Error('No active shift found');

  // Update shift to on_break
  await supabase
    .from('time_clock_entries')
    .update({
      status: 'on_break',
      break_start: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', shift.id);

  // Update technician status
  await supabase
    .from('technicians')
    .update({
      status: 'on_break',
      updated_at: new Date().toISOString(),
    })
    .eq('auth_user_id', user.id);

  return { success: true };
}

/**
 * End break and resume active shift
 */
export async function endBreak(): Promise<any> {
  return supabase.rpc('end_break');
}

/**
 * Accept job assignment (from Today view)
 */
export async function acceptJobAssignment(appointment_id: string): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before acknowledging a job.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'acknowledged' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech?.id ?? null, event_type: 'status_changed', new_status: 'acknowledged', notes: 'Technician acknowledged job assignment' });
  return { success: true };
}

/**
 * Mark technician en route to job
 */
export async function markEnRoute(appointment_id: string, location?: { lat: number; lng: number }): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before marking a job en route.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  if (!tech) throw new Error('Technician not found');
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'en_route' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech.id, event_type: 'en_route', new_status: 'en_route', location: location ?? null, notes: 'Technician is en route' });
  return { success: true };
}

/**
 * Mark technician arrived at job site
 */
export async function markArrived(appointment_id: string, location?: { lat: number; lng: number }): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before marking arrival.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  if (!tech) throw new Error('Technician not found');
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'arrived' });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech.id, event_type: 'arrived', new_status: 'arrived', location: location ?? null, notes: 'Technician arrived at job site' });
  return { success: true };
}

/**
 * Start work on job
 */
export async function startJob(appointment_id: string): Promise<any> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) throw new Error('Select a workspace before starting a job.');
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error('Not authenticated');
  const { data: tech } = await supabase.from('technicians').select('id').eq('auth_user_id', user.id).single();
  await nextApi.appointments.update(appointment_id, { workspace_id, dispatch_status: 'in_progress', actual_start_time: new Date().toISOString() });
  await nextApi.dispatchEvents.create({ workspace_id, appointment_id, technician_id: tech?.id ?? null, event_type: 'started', new_status: 'in_progress', notes: 'Technician started work' });
  return { success: true };
}
