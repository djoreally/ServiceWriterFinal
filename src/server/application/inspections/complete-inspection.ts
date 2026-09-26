import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { inspectionItems, inspectionResults, inspectionTemplates, serviceCatalog, serviceInspections, serviceRecords, workOrderItems, workOrders } from '@/db/schema';

export async function getWorkOrderInspectionPlan(workspaceId:string,workOrderId:string){
  const [workOrder]=await getDb().select({
    id:workOrders.id,appointmentId:workOrders.appointmentId,vehicleId:workOrders.vehicleId,status:workOrders.status,
  }).from(workOrders).where(and(eq(workOrders.workspaceId,workspaceId),eq(workOrders.id,workOrderId))).limit(1);
  if(!workOrder) return null;

  const required=await getDb().selectDistinct({
    templateId:inspectionTemplates.id,templateName:inspectionTemplates.name,serviceId:serviceCatalog.id,serviceName:serviceCatalog.name,
  }).from(workOrderItems)
    .innerJoin(serviceCatalog,and(eq(serviceCatalog.workspaceId,workspaceId),eq(serviceCatalog.id,workOrderItems.serviceCatalogId)))
    .innerJoin(inspectionTemplates,and(eq(inspectionTemplates.id,serviceCatalog.inspectionTemplateId),eq(inspectionTemplates.isActive,true)))
    .where(and(eq(workOrderItems.workspaceId,workspaceId),eq(workOrderItems.workOrderId,workOrderId)));

  const plans=[];
  for(const template of required){
    const items=await getDb().select().from(inspectionItems).where(eq(inspectionItems.templateId,template.templateId)).orderBy(asc(inspectionItems.sortOrder));
    const completed=workOrder.appointmentId?await getDb().select({id:serviceInspections.id}).from(serviceInspections).where(and(
      eq(serviceInspections.workspaceId,workspaceId),eq(serviceInspections.appointmentId,workOrder.appointmentId),
      eq(serviceInspections.templateId,template.templateId),eq(serviceInspections.status,'completed'),
    )).limit(1):[];
    plans.push({...template,items,completed:completed.length>0});
  }
  return {...workOrder,plans};
}

export async function completeInspection(input:{
  workspaceId:string;workOrderId:string;templateId:string;actorUserId:string;inspectorName:string|null;
  notes:string|null;results:Array<{itemId:string;status:'good'|'attention'|'urgent'|'not_applicable';notes:string|null}>;
}){
  const plan=await getWorkOrderInspectionPlan(input.workspaceId,input.workOrderId);
  if(!plan) throw Object.assign(new Error('Work order not found.'),{status:404,code:'work_order_not_found'});
  if(!plan.appointmentId) throw Object.assign(new Error('This work order must be linked to an appointment before inspection.'),{status:409,code:'inspection_appointment_missing'});
  if(!plan.vehicleId) throw Object.assign(new Error('This work order must have a vehicle before inspection.'),{status:409,code:'inspection_vehicle_missing'});
  const template=plan.plans.find(p=>p.templateId===input.templateId);
  if(!template) throw Object.assign(new Error('Inspection template is not required by this work order.'),{status:400,code:'inspection_template_invalid'});
  if(template.completed) return;

  const resultById=new Map(input.results.map(r=>[r.itemId,r]));
  for(const item of template.items){
    if(item.isRequired&&!resultById.has(item.id)) throw Object.assign(new Error('Complete every required inspection item.'),{status:400,code:'inspection_item_required'});
  }

  await getDb().transaction(async tx=>{
    const inspectionId=randomUUID();
    const now=new Date();
    const [serviceRecord]=await tx.select({id:serviceRecords.id}).from(serviceRecords).where(and(
      eq(serviceRecords.workspaceId,input.workspaceId),eq(serviceRecords.workOrderId,input.workOrderId),
    )).limit(1);
    await tx.insert(serviceInspections).values({
      id:inspectionId,workspaceId:input.workspaceId,userId:input.actorUserId,serviceId:serviceRecord?.id??null,
      vehicleId:plan.vehicleId,appointmentId:plan.appointmentId,templateId:template.templateId,templateName:template.templateName,
      inspectorName:input.inspectorName,notes:input.notes,status:'completed',inspectionDate:now,createdAt:now,updatedAt:now,
    });
    const rows=template.items.map(item=>{
      const result=resultById.get(item.id);
      return {
        id:randomUUID(),workspaceId:input.workspaceId,inspectionId,itemName:item.name,itemCategory:item.category,
        status:result?.status??'not_applicable',notes:result?.notes??null,sortOrder:item.sortOrder,createdAt:now,updatedAt:now,
      };
    });
    if(rows.length) await tx.insert(inspectionResults).values(rows);
  });
}
