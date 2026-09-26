import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { serviceCatalog } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export type CreateServiceCommand = Omit<typeof serviceCatalog.$inferInsert, 'id' | 'workspaceId'> & {
  workspaceId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function createServiceCommand(input: CreateServiceCommand) {
  const db = getDb();
  const serviceId = randomUUID();
  const correlationId = randomUUID();
  const { traceId, idempotencyKey, workspaceId, ...serviceValues } = input;

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'service.create',
      idempotencyKey,
      requestFingerprint: serviceValues,
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent service result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(serviceCatalog).where(and(eq(serviceCatalog.workspaceId, workspaceId), eq(serviceCatalog.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent service result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const [service] = await tx
      .insert(serviceCatalog)
      .values({ ...serviceValues, id: serviceId, workspaceId })
      .returning();

    await publishDomainEvent(tx, {
      workspaceId,
      aggregateType: 'service',
      aggregateId: service.id,
      eventType: 'service.created',
      payload: {
        serviceId: service.id,
        laborPrice: service.laborPrice,
      },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'service.create',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { serviceId: service.id },
      resourceType: 'service',
      resourceId: service.id,
    });

    return service;
  });
}
