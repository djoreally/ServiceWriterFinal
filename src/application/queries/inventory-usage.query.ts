/**
 * Inventory Usage Query - Reads completed canonical service records for oil usage.
 */
import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface UsageRow { id:string; consumed_at:string; day:string; inventory_item_id:string; item_name:string; item_category:string|null; quantity:number; unit:string; qty_in_qts:number; source:"warehouse"|"van"; van_id:string|null; van_name:string|null; appointment_id:string|null; customer_name:string|null; vehicle_label:string|null; }
export interface UsageDayBucket { day:string; qty_qt:number; service_count:number; }
export interface UsageItemBucket { inventory_item_id:string; name:string; qty_qt:number; raw_qty:number; unit:string; }
export interface UsageTotals { total_qt:number; total_gal:number; service_count:number; top_item_name:string|null; top_item_qt:number; }
export interface FetchOilUsageParams { from:Date; to:Date; itemIds?:string[]; vanId?:string|null; source?:"van"|"warehouse"|null; search?:string|null; oilOnly?:boolean; }
export interface OilItemOption { id:string; name:string; }
export interface FetchOilUsageResult { rows:UsageRow[]; totals:UsageTotals; byDay:UsageDayBucket[]; byItem:UsageItemBucket[]; availableItems:OilItemOption[]; availableVans:{id:string;name:string}[]; }

function localDay(iso:string):string { const d=new Date(iso); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`; }

export async function fetchOilUsage(params:FetchOilUsageParams):Promise<FetchOilUsageResult>{
  const empty:FetchOilUsageResult={rows:[],totals:{total_qt:0,total_gal:0,service_count:0,top_item_name:null,top_item_qt:0},byDay:[],byItem:[],availableItems:[],availableVans:[]};
  const context=await resolveCurrentWorkspace(); if(!context) return empty;
  const fromIso=params.from.toISOString(); const toIso=params.to.toISOString();
  const {data,error}=await (supabase as any).from("service_records")
    .select("id,appointment_id,customer_id,vehicle_id,oil_quarts_used,completed_at,started_at,created_at,metadata,customers(first_name,last_name,company_name),vehicles(year,make,model,metadata)")
    .eq("workspace_id",context.workspaceId).eq("status","completed").gt("oil_quarts_used",0)
    .gte("completed_at",fromIso).lte("completed_at",toIso).order("completed_at",{ascending:false}).limit(5000);
  if(error) throw new Error(error.message);

  const searchLc=(params.search||"").trim().toLowerCase();
  const rows:UsageRow[]=[];
  for(const r of data??[]){
    const qty=Number(r.oil_quarts_used??0); if(qty<=0) continue;
    const metadata=r.metadata&&typeof r.metadata==="object"&&!Array.isArray(r.metadata)?r.metadata:{};
    const vehicleMetadata=r.vehicles?.metadata&&typeof r.vehicles.metadata==="object"&&!Array.isArray(r.vehicles.metadata)?r.vehicles.metadata:{};
    const oilType=String(metadata.oil_type||vehicleMetadata.oil_type||"Motor Oil");
    if(params.itemIds?.length&&!params.itemIds.includes(oilType)) continue;
    if(params.vanId||params.source==="van") continue; // Van attribution was tied to retired fleet tables; canonical records are warehouse-unattributed until explicit assignment metadata exists.
    const consumedAt=r.completed_at||r.started_at||r.created_at;
    const customerName=r.customers?.company_name||[r.customers?.first_name,r.customers?.last_name].filter(Boolean).join(" ")||null;
    const vehicleLabel=r.vehicles?`${r.vehicles.year??""} ${r.vehicles.make??""} ${r.vehicles.model??""}`.trim():null;
    if(searchLc&&!`${oilType} ${customerName??""} ${vehicleLabel??""}`.toLowerCase().includes(searchLc)) continue;
    rows.push({id:r.id,consumed_at:consumedAt,day:localDay(consumedAt),inventory_item_id:oilType,item_name:oilType,item_category:"Oil",quantity:qty,unit:"qt",qty_in_qts:qty,source:"warehouse",van_id:null,van_name:null,appointment_id:r.appointment_id,customer_name:customerName,vehicle_label:vehicleLabel||null});
  }

  const dayMap=new Map<string,{qt:number;appts:Set<string>}>(); const itemMap=new Map<string,UsageItemBucket>(); const apptSet=new Set<string>();
  for(const row of rows){ if(row.appointment_id) apptSet.add(row.appointment_id); const d=dayMap.get(row.day)??{qt:0,appts:new Set<string>()}; d.qt+=row.qty_in_qts; if(row.appointment_id)d.appts.add(row.appointment_id); dayMap.set(row.day,d); const i=itemMap.get(row.inventory_item_id)??{inventory_item_id:row.inventory_item_id,name:row.item_name,qty_qt:0,raw_qty:0,unit:row.unit}; i.qty_qt+=row.qty_in_qts;i.raw_qty+=row.quantity;itemMap.set(row.inventory_item_id,i); }
  const byDay=Array.from(dayMap.entries()).map(([day,b])=>({day,qty_qt:Math.round(b.qt*100)/100,service_count:b.appts.size})).sort((a,b)=>a.day<b.day?-1:1);
  const byItem=Array.from(itemMap.values()).sort((a,b)=>b.qty_qt-a.qty_qt); const totalQt=rows.reduce((s,r)=>s+r.qty_in_qts,0); const top=byItem[0];
  return {rows,totals:{total_qt:Math.round(totalQt*100)/100,total_gal:Math.round(totalQt/4*100)/100,service_count:apptSet.size,top_item_name:top?.name??null,top_item_qt:top?Math.round(top.qty_qt*100)/100:0},byDay,byItem,availableItems:Array.from(new Set(rows.map(r=>r.item_name))).sort().map(name=>({id:name,name})),availableVans:[]};
}
