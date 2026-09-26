import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { serviceCatalog, workOrderItems, workOrders } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

type WorkOrderItemInsert = typeof workOrderItems.$inferInsert;

export type AddWorkOrderItemCommand = Omit<
  WorkOrderItemInsert,
  'id' | 'workspaceId' | 'workOrderId'
> & {
  workspaceId: string;
  workOrderId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function addWorkOrderItemCommand(input: AddWorkOrderItemCommand) {
  const db = getDb();
  const itemId = randomUUID();
  const correlationId = randomUUID();
  const { workspaceId, workOrderId, traceId, idempotencyKey, serviceCatalogId, ...itemValues } = input;

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'work_order.item.add',
      idempotencyKey,
      requestFingerprint: { workOrderId, serviceCatalogId, itemValues },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent work-order item result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(workOrderItems).where(and(eq(workOrderItems.workspaceId, workspaceId), eq(workOrderItems.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent work-order item result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const [workOrder] = await tx.select({ id: workOrders.id, status: workOrders.status }).from(workOrders).where(and(
      eq(workOrders.workspaceId, workspaceId),
      eq(workOrders.id, workOrderId),
    )).limit(1);
    if (!workOrder) throw Object.assign(new Error('Work order was not found in this workspace'), { status: 404, code: 'work_order_not_found' });
    if (['completed','cancelled'].includes(workOrder.status)) {
      throw Object.assign(new Error('Line items cannot be added to a closed work order'), { status: 409, code: 'work_order_closed' });
    }

    if (serviceCatalogId) {
      const [service] = await tx.select({ id: serviceCatalog.id }).from(serviceCatalog).where(and(
        eq(serviceCatalog.workspaceId, workspaceId),
        eq(serviceCatalog.id, serviceCatalogId),
        eq(serviceCatalog.isActive, true),
      )).limit(1);
      if (!service) throw Object.assign(new Error('Service is not active in this workspace'), { status: 400, code: 'invalid_service' });
    }

    const [item] = await tx.insert(workOrderItems).values({
      ...itemValues,
      id: itemId,
      workspaceId,
      workOrderId,
      serviceCatalogId,
    }).returning();

    await publishDomainEvent(tx, {
      workspaceId,
      aggregateType: 'work_order',
      aggregateId: workOrderId,
      eventType: 'work_order.item_added',
      payload: {
        workOrderId,
        itemId: item.id,
        itemType: item.itemType,
        serviceCatalogId: item.serviceCatalogId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
      },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'work_order.item.add',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { workOrderItemId: item.id },
      resourceType: 'work_order_item',
      resourceId: item.id,
    });

    return item;
  });
}
