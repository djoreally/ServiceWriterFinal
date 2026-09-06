/** Real-time Tech Status Hook — canonical workspace staff identity. */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { clockInTechnician, clockOutTechnician, startBreak, endBreak, markEnRoute, markArrived, startJob } from '@/application/commands/tech-dispatch.command';
import { deriveDispatchStatusFromAppointment, isClosedDispatchStatus, normalizeOperationalTechnicianStatus, type TechnicianOperationalStatus } from '@/lib/dispatch-state';

export interface TechOperationalState { technician_id:string; status:TechnicianOperationalStatus; current_appointment_id:string|null; shift_active:boolean; location_enabled:boolean; current_location:{lat:number;lng:number}|null; }
export interface RealTimeUpdate { type:'job_assigned'|'job_cancelled'|'route_updated'|'urgent_message'|'status_sync'; action?:'INSERT'|'UPDATE'|'DELETE'; payload:unknown; }

export function useRealTimeTechStatus(technician_id?:string){
  const [state,setState]=useState<TechOperationalState|null>(null); const [loading,setLoading]=useState(true);
  const fetchTechState=useCallback(async()=>{
    if(!technician_id){setLoading(false);return;}
    try{
      const [profileRes,shiftRes,appointmentRes]=await Promise.all([
        supabase.from('profiles').select('id').eq('id',technician_id).maybeSingle(),
        supabase.from('time_clock_entries').select('id,status').eq('technician_id',technician_id).in('status',['active','on_break']).order('clock_in',{ascending:false}).limit(1).maybeSingle(),
        supabase.from('appointments').select('id,status,starts_at').eq('assigned_user_id',technician_id).in('status',['pending','confirmed','scheduled','in_progress']).order('starts_at',{ascending:true}).limit(1).maybeSingle(),
      ]);
      if(profileRes.data){
        const shiftActive=!!shiftRes.data; const currentAppointmentId=appointmentRes.data?.id||null;
        const currentDispatchStatus=appointmentRes.data?deriveDispatchStatusFromAppointment(appointmentRes.data.status,appointmentRes.data.status):undefined;
        setState({technician_id,status:normalizeOperationalTechnicianStatus({technicianStatus:null,shiftActive,hasCurrentAppointment:!!currentAppointmentId,currentDispatchStatus}),current_appointment_id:currentAppointmentId,shift_active:shiftActive,location_enabled:false,current_location:null});
      }
    }finally{setLoading(false);}
  },[technician_id]);
  useEffect(()=>{void fetchTechState();},[fetchTechState]);

  const handleRealTimeUpdate=useCallback((update:RealTimeUpdate)=>{
    void fetchTechState();
    if(update.type==='job_assigned') toast.success('New job assigned!',{description:'Check your Today tab for details'});
    else if(update.type==='job_cancelled') toast.info('Job cancelled',{description:'Your schedule has been updated'});
  },[fetchTechState]);

  useEffect(()=>{
    if(!technician_id)return;
    const channel=supabase.channel(`tech-dispatch-${technician_id}`);
    channel.on('postgres_changes',{event:'*',schema:'public',table:'appointments',filter:`assigned_user_id=eq.${technician_id}`},(payload)=>{
      const next=(payload.new??{}) as {status?:unknown}; const prev=(payload.old??{}) as {status?:unknown};
      const nextDispatch=deriveDispatchStatusFromAppointment(next.status,next.status); const prevDispatch=deriveDispatchStatusFromAppointment(prev.status,prev.status);
      const updateType:RealTimeUpdate['type']=payload.eventType==='INSERT'?'job_assigned':payload.eventType==='DELETE'||(isClosedDispatchStatus(nextDispatch)&&!isClosedDispatchStatus(prevDispatch))?'job_cancelled':'status_sync';
      handleRealTimeUpdate({type:updateType,action:payload.eventType as RealTimeUpdate['action'],payload});
    });
    channel.on('postgres_changes',{event:'*',schema:'public',table:'dispatch_events',filter:`technician_id=eq.${technician_id}`},(payload)=>handleRealTimeUpdate({type:'status_sync',payload}));
    channel.subscribe(); return()=>{void supabase.removeChannel(channel);};
  },[handleRealTimeUpdate,technician_id]);

  const transitionToEnRoute=async(appointment_id:string,location?:{lat:number;lng:number})=>{if(!technician_id)return;await markEnRoute(appointment_id,location);await fetchTechState();toast.success('En route to job');};
  const transitionToArrived=async(appointment_id:string,location?:{lat:number;lng:number})=>{if(!technician_id)return;await markArrived(appointment_id,location);await fetchTechState();toast.success('Marked as arrived');};
  const transitionToInProgress=async(appointment_id:string)=>{if(!technician_id)return;await startJob(appointment_id);await fetchTechState();toast.success('Job started');};
  const handleClockIn=async(location?:{lat:number;lng:number})=>{await clockInTechnician(location);await fetchTechState();toast.success('Shift started!');};
  const handleClockOut=async(location?:{lat:number;lng:number})=>{await clockOutTechnician(location);await fetchTechState();toast.success('Shift ended');};
  const handleStartBreak=async()=>{await startBreak();await fetchTechState();toast.success('Break started');};
  const handleEndBreak=async()=>{await endBreak();await fetchTechState();toast.success('Break ended');};
  return {state,loading,transitionToEnRoute,transitionToArrived,transitionToInProgress,handleClockIn,handleClockOut,handleStartBreak,handleEndBreak,refetch:fetchTechState};
}
