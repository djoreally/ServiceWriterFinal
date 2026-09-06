/** Fleet Reports Query - canonical operations data. */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
export interface FleetReportStats{totalSpend:number;vehicleCount:number;locationCount:number;avgCostPerVehicle:number;openApprovals:number;overdueVehicles:number;poOpenCount:number;invoicesPending:number;}
export interface FleetTopVehicleSpendItem{total:number;vehicle:{year:number;make:string;model:string;unit_number:string|null}|null;}
export interface FleetReportPageData{stats:FleetReportStats;topVehicles:FleetTopVehicleSpendItem[];}
export async function fetchFleetReportPageData(_userId:string):Promise<FleetReportPageData>{
 const context=await resolveCurrentWorkspace();if(!context)return{stats:{totalSpend:0,vehicleCount:0,locationCount:0,avgCostPerVehicle:0,openApprovals:0,overdueVehicles:0,poOpenCount:0,invoicesPending:0},topVehicles:[]};const db=supabase as any;
 const [vehiclesRes,locationsRes,woRes,posRes,invoicesRes]=await Promise.all([
  db.from("vehicles").select("id",{count:"exact",head:true}).eq("workspace_id",context.workspaceId),
  db.from("fleet_locations").select("id",{count:"exact",head:true}),
  db.from("work_orders").select("id,vehicle_id,status,metadata,vehicles(year,make,model,metadata)").eq("workspace_id",context.workspaceId),
  db.from("fleet_purchase_orders").select("id,status",{count:"exact"}).in("status",["open","partially_used"]),
  db.from("invoices").select("id,work_order_id,total,amount_paid,status").eq("workspace_id",context.workspaceId),
 ]);
 const invoiceByWork=new Map((invoicesRes.data??[]).filter((i:any)=>i.work_order_id).map((i:any)=>[i.work_order_id,i]));const orders=woRes.data??[];
 const completed=orders.filter((o:any)=>["completed","closed"].includes(String(o.status)));const totalSpend=completed.reduce((sum:number,o:any)=>sum+Number(invoiceByWork.get(o.id)?.total||0),0);const vehicleCount=vehiclesRes.count??0;
 const pendingInvoices=completed.filter((o:any)=>{const invoice=invoiceByWork.get(o.id);return !invoice||!["paid","void"].includes(String(invoice.status));}).length;
 const vehicleSpend:Record<string,FleetTopVehicleSpendItem>={};for(const order of completed){if(!order.vehicle_id)continue;const vehicle=order.vehicles;const meta=vehicle?.metadata&&typeof vehicle.metadata==="object"&&!Array.isArray(vehicle.metadata)?vehicle.metadata:{};vehicleSpend[order.vehicle_id]??={total:0,vehicle:vehicle?{year:Number(vehicle.year)||0,make:vehicle.make||"",model:vehicle.model||"",unit_number:typeof meta.unit_number==="string"?meta.unit_number:null}:null};vehicleSpend[order.vehicle_id].total+=Number(invoiceByWork.get(order.id)?.total||0);}
 const topVehicles=Object.values(vehicleSpend).sort((a,b)=>b.total-a.total).slice(0,5);
 return{stats:{totalSpend,vehicleCount,locationCount:locationsRes.count??0,avgCostPerVehicle:vehicleCount?totalSpend/vehicleCount:0,openApprovals:0,overdueVehicles:0,poOpenCount:posRes.count??0,invoicesPending:pendingInvoices},topVehicles};
}
