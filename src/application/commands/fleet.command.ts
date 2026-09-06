import { supabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const RETIRED = "Fleet operations are separated from Service Writer. Use the Fleet application for Fleet workflows.";
function retired(): never { throw new Error(RETIRED); }

export interface FleetChargeRequest { fleetWorkOrderId:string; paymentMethodId:string; idempotencyKey:string; amountOverride?:number|null; [key:string]:unknown; }
export interface FleetChargeResult { success:boolean; paymentIntentId?:string; paymentRecordId?:string; status?:string; settled?:boolean; error?:{message:string;details?:unknown}; }
export interface CreateVanPayload { name:string; vin?:string|null; license_plate?:string|null; make?:string|null; model?:string|null; year?:number|null; [key:string]:unknown; }
export interface CreateFleetVehiclePayload { fleet_client_id:string; fleet_location_id?:string|null; fleet_contract_id?:string|null; year:number; make:string; model:string; [key:string]:unknown; }
export interface CreateFleetWorkOrderPayload { [key:string]:unknown; }
export interface CreateFleetWorkOrderResult { id:string; orderNumber:string|null; }
export interface GenerateWorkOrdersFromSchedulesResult { generatedCount:number; skippedCount:number; }
export interface CompleteFleetWorkOrderPayload { workOrderId:string; [key:string]:unknown; }
export interface FleetWorkOrderApprovalPayload { workOrderId:string; [key:string]:unknown; }
export interface AddFleetWorkOrderLineItemPayload { workOrderId:string; [key:string]:unknown; }
export interface UpdateFleetWorkOrderLineItemPayload { workOrderId:string; lineItemId?:string; [key:string]:unknown; }
export interface RuntimeIntegrityOptions { idempotencyKey?:string|null; expectedStatus?:string|null; expectedUpdatedAt?:string|null; replayToken?:string|null; }

export async function chargeFleetWorkOrder(_request:FleetChargeRequest):Promise<FleetChargeResult>{return{success:false,error:{message:RETIRED}};}

/** Vans remain a Service Writer dispatch resource, so this one command stays active. */
export async function createVan(payload:CreateVanPayload):Promise<void>{
 const {data:{user}}=await getCurrentAuthUser();if(!user)throw new Error("You must be logged in to create a van.");
 const {error}=await (supabase as any).from("vans").insert({user_id:user.id,name:payload.name,vin:payload.vin??null,license_plate:payload.license_plate??null,make:payload.make??null,model:payload.model??null,year:payload.year??null,status:"available",is_active:true});if(error)throw new Error(error.message||"Failed to create van");
}
export async function createFleetVehicle(_payload:CreateFleetVehiclePayload):Promise<{id:string;warnings:string[]}>{retired();}
export async function updateFleetVehicle(_vehicleId:string,_payload:Partial<CreateFleetVehiclePayload>):Promise<void>{retired();}
export async function deleteFleetVehicle(_vehicleId:string):Promise<void>{retired();}
export async function createFleetWorkOrder(_payload:CreateFleetWorkOrderPayload):Promise<CreateFleetWorkOrderResult>{retired();}
export async function generateWorkOrdersFromApprovedSchedules(_limit=100):Promise<GenerateWorkOrdersFromSchedulesResult>{retired();}
export async function getFleetDispatchScoreBreakdown(_workOrderId:string):Promise<Array<{technicianId:string;technicianName:string;totalScore:number;factors:{distance:number;timeFit:number;priority:number;grouping:number;load:number};rationale:string[]}>>{return[];}
export async function advanceFleetWorkOrderStatus(_workOrderId:string,_options?:RuntimeIntegrityOptions):Promise<void>{retired();}
export async function completeFleetWorkOrderWithDetails(_payload:CompleteFleetWorkOrderPayload):Promise<void>{retired();}
export async function authorizePurchaseOrderForWorkOrder(_workOrderId:string,_purchaseOrderId:string,_options?:RuntimeIntegrityOptions):Promise<void>{retired();}
export async function applyFleetInvoiceAdjustment(_input:{workOrderId:string;adjustedTotal:number;reason:string;[key:string]:unknown}):Promise<void>{retired();}
export async function recordFleetInvoicePayment(_input:{workOrderId:string;amount:unknown;paymentMethod?:string|null;reference?:string|null;notes?:string|null;[key:string]:unknown}):Promise<void>{retired();}
export async function requestFleetWorkOrderApproval(_payload:FleetWorkOrderApprovalPayload):Promise<void>{retired();}
export async function addFleetWorkOrderLineItem(_payload:AddFleetWorkOrderLineItemPayload):Promise<void>{retired();}
export async function updateFleetWorkOrderLineItem(_payload:UpdateFleetWorkOrderLineItemPayload):Promise<void>{retired();}
export async function deleteFleetWorkOrderLineItem(_workOrderId:string,_lineItemId:string):Promise<void>{retired();}
export async function updateFleetWorkOrderNotes(_workOrderId:string,_notes:string|null):Promise<void>{retired();}
export async function updateFleetWorkOrderSchedule(_workOrderId:string,_payload:{scheduledDate:string;scheduledTime:string|null}):Promise<void>{retired();}
export async function runFleetSchedulerReconciliation():Promise<{missingScheduleCount:number;missingScheduleWorkOrderIds:string[]}>{return{missingScheduleCount:0,missingScheduleWorkOrderIds:[]};}
export async function updateFleetWorkOrderDetails(_workOrderId:string,_payload:{serviceType:string|null;description:string|null}):Promise<void>{retired();}
export async function createAppointmentFromFleetWorkOrder(_workOrderId:string):Promise<string>{retired();}
export async function linkFleetWorkOrderToAppointment(_workOrderId:string,_appointmentId:string):Promise<void>{retired();}
