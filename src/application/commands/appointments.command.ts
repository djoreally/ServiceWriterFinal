/**
 * Appointment Commands — canonical appointment writes.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router; `nextApi` stays as
 * the grandfathered typed wrapper. Exported signatures are unchanged. The
 * server resolves the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";
import { queueAppointmentStatusForSync } from "@/offline/outbox/appointments";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import type { AppointmentFormState } from "@/shared/types/forms";
import { requestAppointmentProviderSync } from "./provider-sync.command";
import { nextApi } from "@/lib/nextApiClient";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { syncAppointmentPrimaryService } from "@/lib/appointmentItemsApi";

export interface SaveAppointmentOptions { existingAppointmentId?: string; isPrefillNew?: boolean; }
/** The auto-dispatch verdict the server returns alongside an appointment create (Auto-Dispatch v1). */
export interface AutoDispatchServerOutcome { enabled: boolean; assigned: boolean; technicianId: string | null; technicianName: string | null; reason: string | null; }
export interface SaveAppointmentResult { appointmentId: string; isUpdate: boolean; autoDispatch?: AutoDispatchServerOutcome | null; }

function uuidOrNull(value: unknown): string | null { if (value == null) return null; const normalized=String(value).trim(); if(!normalized||normalized==="undefined"||normalized==="null")return null; return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)?normalized:null; }
function zonedParts(timestamp:number,timezone:string){const parts=new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).formatToParts(new Date(timestamp));const get=(type:Intl.DateTimeFormatPartTypes)=>Number(parts.find(p=>p.type===type)?.value||0);return{year:get("year"),month:get("month"),day:get("day"),hour:get("hour")%24,minute:get("minute"),second:get("second")};}
function workspaceLocalToIso(date:string,time:string,timezone:string):string{const dm=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date),tm=/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);if(!dm||!tm)throw new Error("Invalid appointment date/time");const target={year:+dm[1],month:+dm[2],day:+dm[3],hour:+tm[1],minute:+tm[2],second:+(tm[3]||0)};let candidate=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second);for(let i=0;i<3;i++){const r=zonedParts(candidate,timezone),delta=Date.UTC(target.year,target.month-1,target.day,target.hour,target.minute,target.second)-Date.UTC(r.year,r.month-1,r.day,r.hour,r.minute,r.second);candidate+=delta;if(delta===0)break;}const v=zonedParts(candidate,timezone);if(v.year!==target.year||v.month!==target.month||v.day!==target.day||v.hour!==target.hour||v.minute!==target.minute)throw new Error("That local time is not valid in the workspace timezone. Choose another time.");return new Date(candidate).toISOString();}

interface WorkspaceContextData {
  timezone: string | null;
  tax_rate: number | null;
  operational_settings: Record<string, unknown> | null;
}

async function workspaceContext(): Promise<WorkspaceContextData> {
  const response = await apiClient.get<{ data: WorkspaceContextData | null }>("/v1/appointments/workspace-context");
  return response.data ?? { timezone: null, tax_rate: null, operational_settings: null };
}

async function workspaceTimezone(_workspaceId: string): Promise<string> {
  const context = await workspaceContext();
  return context.timezone || "UTC";
}

async function sendStaffAppointmentConfirmation(appointmentId: string, workspaceId: string): Promise<void> {
  try {
    await apiClient.post(
      `/v1/appointments/${encodeURIComponent(appointmentId)}/confirmation`,
      { workspace_id: workspaceId },
    );
  } catch (error) {
    // Saving the appointment is the primary transaction. Email delivery is a
    // side effect and must not turn a successful database write into a failed UI save.
    console.warn("[saveAppointment] confirmation delivery failed after save", error);
  }
}

export async function saveAppointment(formData:AppointmentFormState,options:SaveAppointmentOptions={}):Promise<SaveAppointmentResult>{
  if(!formData.scheduled_date||!formData.scheduled_time)throw new Error("Please select a date and time");const context=await resolveCurrentWorkspace();if(!context)throw new Error("Select a workspace before saving an appointment.");const customerId=uuidOrNull(formData.customer_id);if(!customerId)throw new Error("Select or create a customer before saving this appointment.");const vehicleId=uuidOrNull(formData.vehicle_id);const serviceCatalogId=uuidOrNull(formData.service_catalog_id);if(!serviceCatalogId)throw new Error("Select a service before saving this appointment.");
  const durationMinutes=Math.max(5,Number(formData.duration_minutes??60)),timezone=await workspaceTimezone(context.workspaceId),startsAt=workspaceLocalToIso(formData.scheduled_date,formData.scheduled_time,timezone),endsAt=new Date(Date.parse(startsAt)+durationMinutes*60000).toISOString();
  let resolvedTaxAmount=formData.tax_amount!=null?Number(formData.tax_amount):null;if(resolvedTaxAmount==null&&formData.estimated_cost!=null){const settings=await fetchBusinessSettings();if(settings){const workspaceSettings=await workspaceContext();resolvedTaxAmount=Number((Number(formData.estimated_cost)*Number(workspaceSettings.tax_rate??0)/100).toFixed(2));}}
  let resolvedLocationAddress=formData.location_address?.trim()||null;if(!resolvedLocationAddress){const addressResponse=await apiClient.get<{ data: { address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null } | null }>(`/v1/appointments/customer-address`,{query:{customer_id:customerId}});const customer=addressResponse.data;if(customer)resolvedLocationAddress=[customer.address_line1,customer.address_line2,customer.city,customer.region,customer.postal_code].filter(Boolean).join(", ")||null;}
  const overrideAvailability=(formData as AppointmentFormState&{override_availability?:boolean}).override_availability===true;
  const payload={workspace_id:context.workspaceId,customer_id:customerId,vehicle_id:vehicleId,starts_at:startsAt,ends_at:endsAt,status:formData.status||"confirmed",notes:formData.notes?.trim()||null,title:formData.title?.trim()||"Appointment",description:formData.description?.trim()||null,guest_name:formData.guest_name?.trim()||null,guest_email:formData.guest_email?.trim()||null,guest_phone:formData.guest_phone?.trim()||null,service_catalog_id:serviceCatalogId,estimated_cost:formData.estimated_cost!=null?Number(formData.estimated_cost):null,tax_amount:resolvedTaxAmount,location_address:resolvedLocationAddress,customer_city:formData.customer_city?.trim()||null,customer_state:formData.customer_state?.trim()||null,customer_postal_code:formData.customer_postal_code?.trim()||null,override_availability:overrideAvailability};
  // Partial-update guard (SW-42): the create payload above always carries
  // every field — absent form values coerced to null, and location_address /
  // tax_amount derived from other records when the form omits them. Sent on
  // UPDATE, that erases stored data the form never mentioned (vehicle
  // assignment, guest fields, quoted tax, the service address). The update
  // payload therefore includes a field only when the form actually carries
  // it; starts/ends/customer/service are always carried because this command
  // requires them.
  const updatePayload: Record<string, unknown> = {
    workspace_id: context.workspaceId,
    customer_id: customerId,
    service_catalog_id: serviceCatalogId,
    starts_at: startsAt,
    ends_at: endsAt,
  };
  if (formData.vehicle_id !== undefined) updatePayload.vehicle_id = vehicleId;
  if (formData.status !== undefined) updatePayload.status = payload.status;
  if (formData.title !== undefined) updatePayload.title = payload.title;
  if (formData.notes !== undefined) updatePayload.notes = payload.notes;
  if (formData.description !== undefined) updatePayload.description = payload.description;
  if (formData.guest_name !== undefined) updatePayload.guest_name = payload.guest_name;
  if (formData.guest_email !== undefined) updatePayload.guest_email = payload.guest_email;
  if (formData.guest_phone !== undefined) updatePayload.guest_phone = payload.guest_phone;
  if (formData.estimated_cost !== undefined) updatePayload.estimated_cost = payload.estimated_cost;
  if (formData.estimated_cost !== undefined || formData.tax_amount !== undefined) updatePayload.tax_amount = resolvedTaxAmount;
  if (formData.location_address !== undefined) updatePayload.location_address = formData.location_address?.trim() || null;
  if (formData.customer_city !== undefined) updatePayload.customer_city = payload.customer_city;
  if (formData.customer_state !== undefined) updatePayload.customer_state = payload.customer_state;
  if (formData.customer_postal_code !== undefined) updatePayload.customer_postal_code = payload.customer_postal_code;
  if (overrideAvailability) updatePayload.override_availability = true;
  const shouldUpdate=Boolean(options.existingAppointmentId&&!options.isPrefillNew);if(shouldUpdate&&options.existingAppointmentId){await nextApi.appointments.update(options.existingAppointmentId,updatePayload);await syncAppointmentPrimaryService({workspaceId:context.workspaceId,appointmentId:options.existingAppointmentId,serviceCatalogId});if(formData.sendEmailNotification&&formData.guest_email?.trim())await sendStaffAppointmentConfirmation(options.existingAppointmentId,context.workspaceId);return{appointmentId:options.existingAppointmentId,isUpdate:true};}
  // Manual quote lock (creation only): staff explicitly locked the typed
  // estimated cost as the custom/flat price. The server stamps the lock,
  // zeroes the tax, and seeds the priced item itself; the primary-service
  // sync below is then a server-side no-op for the locked appointment.
  const lockCustomPrice=(formData as AppointmentFormState&{lock_custom_price?:boolean}).lock_custom_price===true&&Number(formData.estimated_cost)>0;
  const createResponse=await nextApi.appointments.create({...payload,source:"staff",...(lockCustomPrice?{lock_custom_price:true,tax_amount:0}:{})}) as {data:unknown;auto_dispatch?:AutoDispatchServerOutcome|null};const created=createResponse.data;const record=created as{id?:string};if(!record.id)throw new Error("Failed to create appointment");await syncAppointmentPrimaryService({workspaceId:context.workspaceId,appointmentId:record.id,serviceCatalogId});if(formData.guest_email?.trim())await sendStaffAppointmentConfirmation(record.id,context.workspaceId);requestAppointmentProviderSync({appointmentId:record.id,syncMode:"appointment_created",guestEmail:formData.guest_email?.trim()||null}).catch(e=>console.warn("[saveAppointment] provider sync failed",e));return{appointmentId:record.id,isUpdate:false,autoDispatch:createResponse.auto_dispatch??null};
}

export interface AutoDispatchResult{autoDispatchEnabled:boolean;assigned:boolean;topRecommendationName?:string|null;}
/**
 * Reports the auto-dispatch verdict for a staff create. The assignment
 * itself happens server-side at the creation boundary (Auto-Dispatch v1,
 * flag on business_profiles — the one store); this maps the create
 * response's verdict into the caller's shape. Without a server verdict it
 * claims nothing: no enabled flag, no assignment, no recommendation.
 */
export async function tryAutoDispatchAppointment(_appointmentId:string,_formData:AppointmentFormState,serverOutcome?:AutoDispatchServerOutcome|null):Promise<AutoDispatchResult>{if(!serverOutcome)return{autoDispatchEnabled:false,assigned:false,topRecommendationName:null};return{autoDispatchEnabled:serverOutcome.enabled,assigned:serverOutcome.assigned,topRecommendationName:serverOutcome.assigned?serverOutcome.technicianName:null};}
export async function updateAppointmentSchedule(appointmentId:string,scheduledDate:string,scheduledTime:string,options:{overrideAvailability?:boolean}={}):Promise<void>{const context=await resolveCurrentWorkspace();if(!context)throw new Error("Select a workspace before rescheduling an appointment.");const existingResponse=await apiClient.get<{data:{starts_at:string;ends_at:string}|null}>(`/v1/appointments/${encodeURIComponent(appointmentId)}`,{query:{selected_workspace_id:context.workspaceId}});const existing=existingResponse.data;if(!existing)throw new Error("Appointment not found");const timezone=await workspaceTimezone(context.workspaceId),startsAt=workspaceLocalToIso(scheduledDate,scheduledTime,timezone),ps=Date.parse(existing.starts_at),pe=Date.parse(existing.ends_at),duration=Number.isFinite(ps)&&Number.isFinite(pe)&&pe>ps?pe-ps:3600000;await nextApi.appointments.update(appointmentId,{workspace_id:context.workspaceId,starts_at:startsAt,ends_at:new Date(Date.parse(startsAt)+duration).toISOString(),...(options.overrideAvailability?{override_availability:true}:{})});}
export async function updateAppointmentDuration(appointmentId:string,durationMinutes:number):Promise<void>{const context=await resolveCurrentWorkspace();if(!context)throw new Error("Select a workspace before updating an appointment.");if(!Number.isInteger(durationMinutes)||durationMinutes<5||durationMinutes>1440)throw new Error("Duration must be between 5 and 1440 minutes.");await nextApi.appointments.update(appointmentId,{workspace_id:context.workspaceId,duration_minutes:durationMinutes});}
export async function updateAppointmentStatus(appointmentId:string,newStatus:string):Promise<void>{if(await isOfflineEligibleForCurrentUser()){await queueAppointmentStatusForSync(appointmentId,newStatus);return;}const context=await resolveCurrentWorkspace();if(!context)throw new Error("Select a workspace before updating an appointment.");if(newStatus==="completed")await nextApi.appointments.complete(appointmentId,context.workspaceId);else if(newStatus==="cancelled")await nextApi.appointments.cancel(context.workspaceId,appointmentId);else await nextApi.appointments.update(appointmentId,{workspace_id:context.workspaceId,status:newStatus});if(newStatus==="cancelled"){try{const{releaseAppointmentReservations}=await import("./booking-inventory.command");await releaseAppointmentReservations(appointmentId);}catch(e){console.warn("[updateAppointmentStatus] inventory release failed",e);}}}
