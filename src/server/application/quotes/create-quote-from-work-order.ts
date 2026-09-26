import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { quoteItems, quotes, workOrderItems, workOrders } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export type CreateQuoteFromWorkOrderCommand = {
  workspaceId: string;
  workOrderId: string;
  actorUserId: string;
  expiresAt?: Date | null;
  traceId?: string | null;
  idempotencyKey: string;
};

function decimalToCents(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function centsToDecimal(value: number) {
  return (value / 100).toFixed(2);
}

export async function createQuoteFromWorkOrderCommand(input: CreateQuoteFromWorkOrderCommand) {
  const db = getDb();
  const quoteId = randomUUID();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.create_from_work_order',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: {
        workOrderId: input.workOrderId,
        actorUserId: input.actorUserId,
        expiresAt: input.expiresAt?.toISOString() ?? null,
      },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent quote result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(quotes).where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent quote result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      const existingItems = await tx.select().from(quoteItems).where(and(eq(quoteItems.workspaceId, input.workspaceId), eq(quoteItems.quoteId, existing.id))).orderBy(asc(quoteItems.createdAt));
      return { quote: existing, items: existingItems };
    }

    const [workOrder] = await tx.select({
      id: workOrders.id,
      customerId: workOrders.customerId,
      vehicleId: workOrders.vehicleId,
      status: workOrders.status,
    }).from(workOrders).where(and(
      eq(workOrders.workspaceId, input.workspaceId),
      eq(workOrders.id, input.workOrderId),
    )).limit(1);

    if (!workOrder) throw Object.assign(new Error('Work order was not found in this workspace'), { status: 404, code: 'work_order_not_found' });
    if (workOrder.status === 'cancelled') throw Object.assign(new Error('A quote cannot be created from a cancelled work order'), { status: 409, code: 'work_order_cancelled' });

    const items = await tx.select().from(workOrderItems).where(and(
      eq(workOrderItems.workspaceId, input.workspaceId),
      eq(workOrderItems.workOrderId, input.workOrderId),
    )).orderBy(asc(workOrderItems.sortOrder));

    if (items.length === 0) throw Object.assign(new Error('A quote requires at least one work-order line item'), { status: 409, code: 'quote_requires_items' });

    // Monetary totals are calculated in integer cents. JavaScript floating-point
    // values never become the source of truth for stored currency amounts.
    let subtotalCents = 0;
    let taxCents = 0;
    const snapshots = items.map((item) => {
      const quantity = Number(item.quantity);
      const unitPriceCents = decimalToCents(item.unitPrice);
      const lineCents = Math.round(quantity * unitPriceCents);
      const lineTaxCents = Math.round(lineCents * Number(item.taxRate) / 100);
      subtotalCents += lineCents;
      taxCents += lineTaxCents;
      return {
        id: randomUUID(),
        quoteId,
        workspaceId: input.workspaceId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: centsToDecimal(lineCents),
      };
    });

    const subtotal = centsToDecimal(subtotalCents);
    const taxTotal = centsToDecimal(taxCents);
    const total = centsToDecimal(subtotalCents + taxCents);

    const [quote] = await tx.insert(quotes).values({
      id: quoteId,
      workspaceId: input.workspaceId,
      customerId: workOrder.customerId,
      vehicleId: workOrder.vehicleId,
      workOrderId: workOrder.id,
      status: 'draft',
      subtotal,
      taxTotal,
      total,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.actorUserId,
      metadata: {},
    }).returning();

    await tx.insert(quoteItems).values(snapshots);

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: 'quote.created',
      payload: {
        quoteId: quote.id,
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
        subtotal,
        taxTotal,
        total,
        itemCount: snapshots.length,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.create_from_work_order',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 201,
      responseBody: { quoteId: quote.id },
      resourceType: 'quote',
      resourceId: quote.id,
    });

    return { quote, items: snapshots };
  });
}
