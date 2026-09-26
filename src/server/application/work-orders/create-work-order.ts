import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { appointments, customers, locations, vehicles, workOrders } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

type WorkOrderInsert = typeof workOrders.$inferInsert;

export type CreateWorkOrderCommand = Omit<
  WorkOrderInsert,
  'id' | 'workspaceId' | 'createdBy' | 'number' | 'status' | 'openedAt'
> & {
  workspaceId: string;
  actorUserId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function createWorkOrderCommand(input: CreateWorkOrderCommand) {
  const db = getDb();
  const workOrderId = randomUUID();
  const correlationId = randomUUID();
  const {
    actorUserId,
    traceId,
    idempotencyKey,
    workspaceId,
    customerId,
    vehicleId,
    appointmentId,
    locationId,
    ...workOrderValues
  } = input;

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'work_order.create',
      idempotencyKey,
      requestFingerprint: { actorUserId, customerId, vehicleId, appointmentId, locationId, workOrderValues },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent work-order result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(workOrders).where(and(eq(workOrders.workspaceId, workspaceId), eq(workOrders.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent work-order result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.workspaceId, workspaceId),
        eq(customers.id, customerId),
        ne(customers.status, 'archived'),
      ))
      .limit(1);
    if (!customer) throw Object.assign(new Error('Customer does not belong to this workspace'), { status: 400, code: 'invalid_customer' });

    if (vehicleId) {
      const [vehicle] = await tx.select({ customerId: vehicles.customerId }).from(vehicles).where(and(
        eq(vehicles.workspaceId, workspaceId),
        eq(vehicles.id, vehicleId),
        ne(vehicles.status, 'archived'),
      )).limit(1);
      if (!vehicle) throw Object.assign(new Error('Vehicle does not belong to this workspace'), { status: 400, code: 'invalid_vehicle' });
      if (vehicle.customerId && vehicle.customerId !== customerId) {
        throw Object.assign(new Error('Vehicle belongs to a different customer'), { status: 409, code: 'vehicle_customer_mismatch' });
      }
    }

    if (appointmentId) {
      const [appointment] = await tx.select({
        customerId: appointments.customerId,
        vehicleId: appointments.vehicleId,
        locationId: appointments.locationId,
      }).from(appointments).where(and(
        eq(appointments.workspaceId, workspaceId),
        eq(appointments.id, appointmentId),
      )).limit(1);
      if (!appointment) throw Object.assign(new Error('Appointment does not belong to this workspace'), { status: 400, code: 'invalid_appointment' });
      if (appointment.customerId !== customerId || appointment.vehicleId !== vehicleId || (appointment.locationId && appointment.locationId !== locationId)) {
        throw Object.assign(new Error('Work order does not match the appointment customer, vehicle, or location'), { status: 409, code: 'appointment_work_order_mismatch' });
      }
    }

    if (locationId) {
      const [location] = await tx.select({ id: locations.id }).from(locations).where(and(
        eq(locations.workspaceId, workspaceId),
        eq(locations.id, locationId),
        eq(locations.isActive, true),
      )).limit(1);
      if (!location) throw Object.assign(new Error('Location is not active in this workspace'), { status: 400, code: 'invalid_location' });
    }


    const [workOrder] = await tx.insert(workOrders).values({
      ...workOrderValues,
      id: workOrderId,
      workspaceId,
      appointmentId,
      customerId,
      vehicleId,
      locationId,
      status: 'draft',
      openedAt: new Date(),
      createdBy: actorUserId,
    }).returning();

    await publishDomainEvent(tx, {
      workspaceId,
      aggregateType: 'work_order',
      aggregateId: workOrder.id,
      eventType: 'work_order.created',
      payload: {
        workOrderId: workOrder.id,
        number: workOrder.number,
        appointmentId,
        customerId,
        vehicleId,
        locationId,
        status: workOrder.status,
      },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'work_order.create',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { workOrderId: workOrder.id },
      resourceType: 'work_order',
      resourceId: workOrder.id,
    });

    return workOrder;
  });
}
