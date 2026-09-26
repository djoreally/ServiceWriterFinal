import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { appointments, serviceCatalog, serviceInspections, serviceRecords, workOrderItems, workOrders } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';

export async function requiredInspectionTemplates(workspaceId:string,workOrderId:string){
  return getDb().selectDistinct({
    templateId:serviceCatalog.inspectionTemplateId,
  }).from(workOrderItems)
    .innerJoin(serviceCatalog,and(eq(serviceCatalog.workspaceId,workspaceId),eq(serviceCatalog.id,workOrderItems.serviceCatalogId)))
    .where(and(eq(workOrderItems.workspaceId,workspaceId),eq(workOrderItems.workOrderId,workOrderId),sql`${serviceCatalog.inspectionTemplateId} is not null`));
}

export async function startWorkOrderJob(input:{workspaceId:string;workOrderId:string;actorUserId:string}){
  return getDb().transaction(async tx=>{
    const rows=await tx.execute<{status:string;appointment_id:string|null;customer_id:string;vehicle_id:string|null;complaint:string|null}>(sql`
      select status,appointment_id,customer_id,vehicle_id,complaint from work_orders
      where workspace_id=${input.workspaceId} and id=${input.workOrderId} for update
    `);
    const current=rows[0];
    if(!current) throw Object.assign(new Error('Work order not found.'),{status:404,code:'work_order_not_found'});
    if(['completed','cancelled'].includes(current.status)) throw Object.assign(new Error('Closed work order cannot be started.'),{status:409,code:'work_order_closed'});
    const startedAt=new Date();
    await tx.update(workOrders).set({status:'in_progress',openedAt:startedAt,updatedAt:startedAt}).where(and(eq(workOrders.workspaceId,input.workspaceId),eq(workOrders.id,input.workOrderId)));
    if(current.appointment_id) await tx.update(appointments).set({status:'in_progress',updatedAt:startedAt}).where(and(eq(appointments.workspaceId,input.workspaceId),eq(appointments.id,current.appointment_id)));
    const [existingRecord]=await tx.select({id:serviceRecords.id}).from(serviceRecords).where(and(eq(serviceRecords.workspaceId,input.workspaceId),eq(serviceRecords.workOrderId,input.workOrderId))).limit(1);
    if(!existingRecord) await tx.insert(serviceRecords).values({
      id:randomUUID(),workspaceId:input.workspaceId,appointmentId:current.appointment_id,workOrderId:input.workOrderId,
      technicianId:input.actorUserId,status:'in_progress',complaint:current.complaint,metadata:{},startedAt,currencyCode:'USD',
      customerId:current.customer_id,vehicleId:current.vehicle_id,createdAt:startedAt,updatedAt:startedAt,
    });
    await publishDomainEvent(tx,{workspaceId:input.workspaceId,aggregateType:'work_order',aggregateId:input.workOrderId,eventType:'work_order.started',idempotencyKey:'work-order-start:'+input.workOrderId+':'+startedAt.toISOString(),payload:{workOrderId:input.workOrderId,appointmentId:current.appointment_id,actorUserId:input.actorUserId,startedAt:startedAt.toISOString()}});
  });
}

export async function completeWorkOrderJob(input:{workspaceId:string;workOrderId:string;actorUserId:string;workPerformed?:string|null}){
  return getDb().transaction(async tx=>{
    const rows=await tx.execute<{status:string;appointment_id:string|null}>(sql`
      select status,appointment_id from work_orders where workspace_id=${input.workspaceId} and id=${input.workOrderId} for update
    `);
    const current=rows[0];
    if(!current) throw Object.assign(new Error('Work order not found.'),{status:404,code:'work_order_not_found'});
    if(current.status==='completed') return;
    if(current.status!=='in_progress') throw Object.assign(new Error('Start the job before completing it.'),{status:409,code:'job_not_in_progress'});

    const required=await tx.selectDistinct({templateId:serviceCatalog.inspectionTemplateId}).from(workOrderItems)
      .innerJoin(serviceCatalog,and(eq(serviceCatalog.workspaceId,input.workspaceId),eq(serviceCatalog.id,workOrderItems.serviceCatalogId)))
      .where(and(eq(workOrderItems.workspaceId,input.workspaceId),eq(workOrderItems.workOrderId,input.workOrderId),sql`${serviceCatalog.inspectionTemplateId} is not null`));
    const ids=required.map(r=>r.templateId).filter((id):id is string=>Boolean(id));
    if(ids.length){
      if(!current.appointment_id) throw Object.assign(new Error('Required inspection cannot be verified without an appointment.'),{status:409,code:'inspection_appointment_missing'});
      const completed=await tx.selectDistinct({templateId:serviceInspections.templateId}).from(serviceInspections).where(and(
        eq(serviceInspections.workspaceId,input.workspaceId),eq(serviceInspections.appointmentId,current.appointment_id),
        eq(serviceInspections.status,'completed'),inArray(serviceInspections.templateId,ids),
      ));
      const completedIds=new Set(completed.map(x=>x.templateId));
      const missing=ids.filter(id=>!completedIds.has(id));
      if(missing.length) throw Object.assign(new Error('Complete all required inspections before completing the job.'),{status:409,code:'inspection_required'});
    }

    const completedAt=new Date();
    await tx.update(workOrders).set({status:'completed',completedAt,updatedAt:completedAt}).where(and(eq(workOrders.workspaceId,input.workspaceId),eq(workOrders.id,input.workOrderId)));
    if(current.appointment_id) await tx.update(appointments).set({status:'completed',updatedAt:completedAt}).where(and(eq(appointments.workspaceId,input.workspaceId),eq(appointments.id,current.appointment_id)));
    await tx.update(serviceRecords).set({status:'completed',completedBy:input.actorUserId,workPerformed:input.workPerformed??null,completedAt,updatedAt:completedAt})
      .where(and(eq(serviceRecords.workspaceId,input.workspaceId),eq(serviceRecords.workOrderId,input.workOrderId)));
    await publishDomainEvent(tx,{workspaceId:input.workspaceId,aggregateType:'work_order',aggregateId:input.workOrderId,eventType:'work_order.completed',idempotencyKey:'work-order-complete:'+input.workOrderId+':'+completedAt.toISOString(),payload:{workOrderId:input.workOrderId,appointmentId:current.appointment_id,actorUserId:input.actorUserId,completedAt:completedAt.toISOString()}});
  });
}
