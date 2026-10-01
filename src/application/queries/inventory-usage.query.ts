/**
 * Oil usage reporting. Completed service records are authoritative for actual
 * oil consumed; inventory is optional reconciliation only.
 *
 * Phase 2: the reporting bundle is fetched through the typed API client
 * (`@/lib/api-client`) from `GET /v1/inventory/oil-usage`. The client-side
 * aggregation is unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface UsageRow { id:string; consumed_at:string; day:string; inventory_item_id:string; item_name:string; item_category:string|null; quantity:number; unit:string; qty_in_qts:number; source:"completed_service"|"inventory_reconciled"; van_id:string|null; van_name:string|null; appointment_id:string|null; customer_name:string|null; vehicle_label:string|null }
export interface UsageDayBucket { day:string; qty_qt:number; service_count:number }
export interface UsageItemBucket { inventory_item_id:string; name:string; qty_qt:number; raw_qty:number; unit:string }
export interface UsageTotals { total_qt:number; total_gal:number; service_count:number; top_item_name:string|null; top_item_qt:number }
export interface FetchOilUsageParams { from:Date; to:Date; itemIds?:string[]; vanId?:string|null; source?:"completed_service"|"inventory_reconciled"|null; search?:string|null; oilOnly?:boolean }
export interface OilItemOption { id:string; name:string }
export interface FetchOilUsageResult { rows:UsageRow[]; totals:UsageTotals; byDay:UsageDayBucket[]; byItem:UsageItemBucket[]; availableItems:OilItemOption[]; availableVans:{id:string;name:string}[] }

function localDay(iso:string){ const d=new Date(iso); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function rec(value:unknown):Record<string,unknown>{ return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
function bookingOilType(metadata:unknown){ const root=rec(metadata), config=rec(root.booking_configuration), vehicle=rec(config.vehicle), oil=rec(vehicle.oil), value=oil.oilType; return typeof value==="string"&&value.trim()?value.trim():null; }

interface OilUsageBundle {
  service_records: Array<{id:string;appointment_id:string|null;customer_id:string|null;vehicle_id:string|null;completed_at:string|null;oil_quarts_used:number|string|null;metadata:unknown}>;
  customers: any[];
  vehicles: any[];
  vehicle_service_specs: Array<{vehicle_id:string;oil_type:string|null}>;
  appointments: Array<{id:string;metadata:unknown}>;
  inventory_movements: Array<{service_record_id:string}>;
}

export async function fetchOilUsage(params:FetchOilUsageParams):Promise<FetchOilUsageResult>{
  const empty:FetchOilUsageResult={rows:[],totals:{total_qt:0,total_gal:0,service_count:0,top_item_name:null,top_item_qt:0},byDay:[],byItem:[],availableItems:[],availableVans:[]};
  const workspace=await resolveCurrentWorkspace(); if(!workspace?.workspaceId)return empty; const workspaceId=workspace.workspaceId;
  const bundle = await apiClient.get<{ data: OilUsageBundle }>("/v1/inventory/oil-usage", {
    query: {
      workspace_id: workspaceId,
      from: params.from.toISOString(),
      to: params.to.toISOString(),
    },
  });
  const services=bundle.data.service_records ?? []; if(!services.length)return empty;
  const customersRes={data:bundle.data.customers ?? []}, vehiclesRes={data:bundle.data.vehicles ?? []}, specsRes={data:bundle.data.vehicle_service_specs ?? []}, appointmentsRes={data:bundle.data.appointments ?? []}, movementsRes={data:bundle.data.inventory_movements ?? []};
  const customerMap=new Map<string,any>((customersRes.data as any[]).map((r:any)=>[r.id,r]));
  const vehicleMap=new Map<string,any>((vehiclesRes.data as any[]).map((r:any)=>[r.id,r]));
  const specMap=new Map<string,string|null>((specsRes.data as any[]).map((r:any)=>[r.vehicle_id,(r.oil_type as string|null)??null]));
  const appointmentMap=new Map<string,unknown>((appointmentsRes.data as any[]).map((r:any)=>[r.id,r.metadata]));
  const reconciled=new Set<string>((movementsRes.data as any[]).map((r:any)=>String(r.service_record_id)));
  const allRows:UsageRow[]=services.map(r=>{ const qty=Number(r.oil_quarts_used??0), customer=r.customer_id?customerMap.get(r.customer_id):null, vehicle=r.vehicle_id?vehicleMap.get(r.vehicle_id):null, appointmentMetadata=r.appointment_id?appointmentMap.get(r.appointment_id):null; const oilType=(r.vehicle_id?specMap.get(r.vehicle_id):null)||bookingOilType(appointmentMetadata)||bookingOilType(r.metadata)||"Oil type not captured"; const customerName=customer?(customer.company_name||`${customer.first_name??""} ${customer.last_name??""}`.trim()||null):null, vehicleLabel=vehicle?`${vehicle.year??""} ${vehicle.make??""} ${vehicle.model??""}`.trim()||null:null, consumedAt=r.completed_at||new Date(0).toISOString(); return {id:r.id,consumed_at:consumedAt,day:localDay(consumedAt),inventory_item_id:oilType,item_name:oilType,item_category:"Oil",quantity:qty,unit:"qt",qty_in_qts:qty,source:reconciled.has(r.id)?"inventory_reconciled":"completed_service",van_id:null,van_name:null,appointment_id:r.appointment_id,customer_name:customerName,vehicle_label:vehicleLabel}; });
  const itemFilter=params.itemIds?.length?new Set(params.itemIds):null, q=(params.search??"").trim().toLowerCase();
  const rows=allRows.filter(r=>(!itemFilter||itemFilter.has(r.inventory_item_id))&&(!params.source||r.source===params.source)&&(!q||`${r.item_name} ${r.customer_name??""} ${r.vehicle_label??""}`.toLowerCase().includes(q)));
  const availableItems=[...new Set(allRows.map(r=>r.item_name))].sort().map(name=>({id:name,name})); const dayMap=new Map<string,{qt:number;services:Set<string>}>(), itemMap=new Map<string,UsageItemBucket>();
  for(const row of rows){ const day=dayMap.get(row.day)??{qt:0,services:new Set<string>()}; day.qt+=row.qty_in_qts; day.services.add(row.id); dayMap.set(row.day,day); const item=itemMap.get(row.inventory_item_id)??{inventory_item_id:row.inventory_item_id,name:row.item_name,qty_qt:0,raw_qty:0,unit:"qt"}; item.qty_qt+=row.qty_in_qts; item.raw_qty+=row.quantity; itemMap.set(row.inventory_item_id,item); }
  const byDay=[...dayMap.entries()].map(([day,b])=>({day,qty_qt:Math.round(b.qt*100)/100,service_count:b.services.size})).sort((a,b)=>a.day.localeCompare(b.day)), byItem=[...itemMap.values()].sort((a,b)=>b.qty_qt-a.qty_qt), totalQt=rows.reduce((s,r)=>s+r.qty_in_qts,0), top=byItem[0];
  return {rows,totals:{total_qt:Math.round(totalQt*100)/100,total_gal:Math.round(totalQt/4*100)/100,service_count:rows.length,top_item_name:top?.name??null,top_item_qt:top?.qty_qt??0},byDay,byItem,availableItems,availableVans:[]};
}
