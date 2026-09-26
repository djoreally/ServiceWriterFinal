import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { customers, vehicles } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export type CreateVehicleCommand = Omit<typeof vehicles.$inferInsert, 'id' | 'workspaceId'> & {
  workspaceId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function createVehicleCommand(input: CreateVehicleCommand) {
  const db = getDb();
  const vehicleId = randomUUID();
  const correlationId = randomUUID();

  const { traceId, idempotencyKey, workspaceId, ...vehicleValues } = input;

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'vehicle.create',
      idempotencyKey,
      requestFingerprint: vehicleValues,
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent vehicle result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(vehicles).where(and(eq(vehicles.workspaceId, workspaceId), eq(vehicles.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent vehicle result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    if (vehicleValues.customerId) {
      const [customer] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(and(
          eq(customers.workspaceId, workspaceId),
          eq(customers.id, vehicleValues.customerId),
          ne(customers.status, 'archived'),
        ))
        .limit(1);

      if (!customer) {
        throw Object.assign(new Error('Customer does not belong to this workspace'), {
          status: 400,
          code: 'invalid_customer',
        });
      }
    }

    const [vehicle] = await tx
      .insert(vehicles)
      .values({
        ...vehicleValues,
        id: vehicleId,
        workspaceId,
      })
      .returning();

    await publishDomainEvent(tx, {
      workspaceId: workspaceId,
      aggregateType: 'vehicle',
      aggregateId: vehicle.id,
      eventType: 'vehicle.created',
      payload: {
        vehicleId: vehicle.id,
        customerId: vehicle.customerId,
      },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'vehicle.create',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { vehicleId: vehicle.id },
      resourceType: 'vehicle',
      resourceId: vehicle.id,
    });

    return vehicle;
  });
}
