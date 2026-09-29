import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { customers, serviceCatalog, vehicles, workOrderItems, workOrders, workspaceSettings } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export type CreateFleetBatchWorkOrdersCommand = {
  workspaceId: string;
  customerId: string;
  poNumber?: string | null;
  vehicleIds: string[];
  serviceIds: string[];
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  complaint?: string | null;
  actorUserId: string;
  idempotencyKey: string;
  traceId?: string | null;
};

export async function createFleetBatchWorkOrdersCommand(input: CreateFleetBatchWorkOrdersCommand) {
  const db = getDb();
  const correlationId = randomUUID();

  if (!input.vehicleIds.length) {
    throw Object.assign(new Error('At least one vehicle must be selected for fleet batch processing'), {
      status: 400,
      code: 'fleet_vehicles_required',
    });
  }

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'fleet.batch_work_orders.create',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: {
        customerId: input.customerId,
        poNumber: input.poNumber ?? null,
        vehicleIds: input.vehicleIds.sort(),
        serviceIds: input.serviceIds.sort(),
        priority: input.priority ?? 'normal',
      },
    });

    if (claim.kind === 'replay') {
      const createdIds = (claim.responseBody?.workOrderIds as string[]) || [];
      const rows = await tx
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.workspaceId, input.workspaceId), inArray(workOrders.id, createdIds)));
      return { workOrders: rows, count: rows.length };
    }

    // Verify Customer
    const [customer] = await tx
      .select({ id: customers.id, companyName: customers.companyName })
      .from(customers)
      .where(and(
        eq(customers.workspaceId, input.workspaceId),
        eq(customers.id, input.customerId),
        ne(customers.status, 'archived'),
      ))
      .limit(1);

    if (!customer) {
      throw Object.assign(new Error('Fleet customer not found in this workspace'), {
        status: 404,
        code: 'fleet_customer_not_found',
      });
    }

    // Verify all vehicles belong strictly to this customer & workspace
    const fleetVehicles = await tx
      .select({ id: vehicles.id, customerId: vehicles.customerId })
      .from(vehicles)
      .where(and(
        eq(vehicles.workspaceId, input.workspaceId),
        inArray(vehicles.id, input.vehicleIds),
        ne(vehicles.status, 'archived'),
      ));

    if (fleetVehicles.length !== input.vehicleIds.length) {
      throw Object.assign(new Error('One or more selected vehicles do not exist in this workspace'), {
        status: 400,
        code: 'fleet_vehicle_not_found',
      });
    }

    const invalidVehicle = fleetVehicles.find((v) => v.customerId !== input.customerId);
    if (invalidVehicle) {
      throw Object.assign(new Error('One or more vehicles belong to a different customer account'), {
        status: 409,
        code: 'vehicle_customer_mismatch',
      });
    }

    // Fetch services to attach
    const services = input.serviceIds.length
      ? await tx
          .select()
          .from(serviceCatalog)
          .where(and(
            eq(serviceCatalog.workspaceId, input.workspaceId),
            inArray(serviceCatalog.id, input.serviceIds),
            eq(serviceCatalog.isActive, true),
          ))
      : [];

    const [settings] = await tx
      .select({ taxRate: workspaceSettings.taxRate })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, input.workspaceId))
      .limit(1);

    const taxRate = settings?.taxRate ?? '0';
    const createdOrders: Array<typeof workOrders.$inferSelect> = [];
    const now = new Date();

    for (const vehicle of fleetVehicles) {
      const workOrderId = randomUUID();
      const [order] = await tx
        .insert(workOrders)
        .values({
          id: workOrderId,
          workspaceId: input.workspaceId,
          customerId: input.customerId,
          vehicleId: vehicle.id,
          status: 'draft',
          priority: input.priority ?? 'normal',
          complaint: input.complaint ?? (input.poNumber ? `Fleet PO: ${input.poNumber}` : null),
          openedAt: now,
          createdBy: input.actorUserId,
          metadata: {
            fleetBatch: true,
            poNumber: input.poNumber ?? null,
          },
        })
        .returning();

      createdOrders.push(order);

      // Insert line items
      if (services.length > 0) {
        const itemRows = services.map((svc, idx) => ({
          id: randomUUID(),
          workspaceId: input.workspaceId,
          workOrderId: order.id,
          serviceCatalogId: svc.id,
          itemType: 'service' as const,
          description: svc.name,
          quantity: '1',
          unitPrice: svc.laborPrice,
          taxRate,
          sortOrder: idx,
        }));
        await tx.insert(workOrderItems).values(itemRows);
      }
    }

    const orderIds = createdOrders.map((o) => o.id);

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'fleet',
      aggregateId: input.customerId,
      eventType: 'fleet.batch_work_orders_created',
      payload: {
        customerId: input.customerId,
        poNumber: input.poNumber ?? null,
        workOrderCount: orderIds.length,
        workOrderIds: orderIds,
        serviceCount: services.length,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'fleet.batch_work_orders.create',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 201,
      responseBody: { workOrderIds: orderIds, count: orderIds.length },
      resourceType: 'fleet_batch',
      resourceId: input.customerId,
    });

    return { workOrders: createdOrders, count: createdOrders.length };
  });
}
