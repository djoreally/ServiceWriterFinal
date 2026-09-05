import { dispatchLifecycleEvent, dispatchLifecycleEvents, LIFECYCLE_EVENT_KEYS, type LifecycleRecipientRole } from "@/server/messaging/lifecycle-events";
import type { LifecycleVariables } from "@/server/messaging/lifecycle-templates";
import { getBookingNotificationEmails } from "@/server/messaging/booking-notification-recipients";

type CustomerContact = { id?: string | null; first_name?: string | null; last_name?: string | null; email?: string | null; };
type VehicleSummary = { year?: string | number | null; make?: string | null; model?: string | null; };
export type AppointmentLifecycleRecord = { id:string; workspace_id:string; customer_id?:string|null; starts_at:string; ends_at?:string|null; status?:string|null; notes?:string|null; metadata?:Record<string,unknown>|null; customers?:CustomerContact|CustomerContact[]|null; vehicles?:VehicleSummary|VehicleSummary[]|null; };

function one<T>(value:T|T[]|null|undefined):T|undefined{return Array.isArray(value)?value[0]:value??undefined;}
function formatDateTime(value:string,timezone:string){const date=new Date(value);return{date:new Intl.DateTimeFormat("en-US",{timeZone:timezone,weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(date),time:new Intl.DateTimeFormat("en-US",{timeZone:timezone,hour:"numeric",minute:"2-digit"}).format(date)};}
function text(value:unknown,fallback:string):string{return value===null||value===undefined||value===""?fallback:String(value);}

export function appointmentLifecycleVariables(input:{appointment:AppointmentLifecycleRecord;workspaceName:string;workspaceTimezone:string;actionUrl:string;technicianName?:string|null;changedFields?:string[];}):LifecycleVariables{
 const metadata=input.appointment.metadata??{},customer=one(input.appointment.customers),vehicle=one(input.appointment.vehicles),customerName=[customer?.first_name,customer?.last_name].filter(Boolean).join(" ")||text(metadata.guest_name,"Customer"),when=formatDateTime(input.appointment.starts_at,input.workspaceTimezone),year=text(vehicle?.year,text(metadata.vehicle_year,"Vehicle")),make=text(vehicle?.make,text(metadata.vehicle_make,"details")),model=text(vehicle?.model,text(metadata.vehicle_model,"on file"));
 return{"business.name":input.workspaceName,"business.timezone":input.workspaceTimezone,"business.email":typeof metadata.business_email==="string"?metadata.business_email:undefined,"business.phone":typeof metadata.business_phone==="string"?metadata.business_phone:undefined,"customer.first_name":customerName.split(/\s+/)[0],"customer.full_name":customerName,"appointment.service":text(metadata.title??metadata.service_name,"Service appointment"),"appointment.date":when.date,"appointment.time":when.time,"appointment.address":text(metadata.service_address??metadata.location_address??metadata.address,"Address on appointment"),"appointment.changed_fields":input.changedFields?.join(", ")||"Appointment details","appointment.confirmation_code":input.appointment.id.slice(0,8).toUpperCase(),"technician.name":input.technicianName||"Your assigned technician","vehicle.year":year,"vehicle.make":make,"vehicle.model":model,"vehicle.description":[year,make,model].join(" "),"email.primary_action_url":input.actionUrl};
}
export function appointmentCustomerEmail(appointment:AppointmentLifecycleRecord):string|null{const customer=one(appointment.customers),guestEmail=appointment.metadata?.guest_email;return customer?.email||(typeof guestEmail==="string"?guestEmail:null);}

const STAFF_FANOUT_EVENTS=new Set<string>([LIFECYCLE_EVENT_KEYS.appointmentCancelled,LIFECYCLE_EVENT_KEYS.appointmentRescheduled]);

export async function dispatchAppointmentLifecycle(input:{eventKey:string;eventId:string;appointment:AppointmentLifecycleRecord;workspaceName:string;workspaceTimezone:string;actionUrl:string;recipientEmail?:string|null;recipientRole?:LifecycleRecipientRole;technicianName?:string|null;changedFields?:string[];}){
 const recipientEmail=input.recipientEmail??appointmentCustomerEmail(input.appointment);if(!recipientEmail)return null;
 const variables=appointmentLifecycleVariables(input);
 const customerEvent={templateKey:input.eventKey,eventId:input.eventId,entityType:"appointment" as const,entityId:input.appointment.id,workspaceId:input.appointment.workspace_id,customerId:input.appointment.customer_id,recipientEmail,recipientRole:input.recipientRole??"customer" as LifecycleRecipientRole,variables,metadata:{appointmentId:input.appointment.id}};
 const customerResult=await dispatchLifecycleEvent(customerEvent);
 if(STAFF_FANOUT_EVENTS.has(input.eventKey)){
   const staffEmails=(await getBookingNotificationEmails(input.appointment.workspace_id)).filter(email=>email!==recipientEmail.toLowerCase());
   if(staffEmails.length){await dispatchLifecycleEvents(staffEmails.map(email=>({...customerEvent,eventId:`${input.eventId}:staff:${email}`,recipientEmail:email,recipientRole:"staff" as const,variables:{...variables,"email.primary_action_url":new URL(`/appointments/${input.appointment.id}`,input.actionUrl).toString()}})));}
 }
 return customerResult;
}
