import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDb } from '@/db/client';
import { customers } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export type CreateCustomerCommand = Omit<typeof customers.$inferInsert, 'id' | 'workspaceId' | 'createdBy'> & {
  workspaceId: string;
  actorUserId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function createCustomerCommand(input: CreateCustomerCommand) {
  const db = getDb();
  const customerId = randomUUID();
  const correlationId = randomUUID();

  const { actorUserId, traceId, idempotencyKey, workspaceId, ...customerValues } = input;

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'customer.create',
      idempotencyKey,
      requestFingerprint: { actorUserId, customerValues },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent customer result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(customers).where(eq(customers.id, claim.resourceId)).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent customer result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const [customer] = await tx
      .insert(customers)
      .values({
        ...customerValues,
        id: customerId,
        workspaceId,
        createdBy: actorUserId,
      })
      .returning();

    await publishDomainEvent(tx, {
      workspaceId,
      aggregateType: 'customer',
      aggregateId: customer.id,
      eventType: 'customer.created',
      payload: { customerId: customer.id },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'customer.create',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { customerId: customer.id },
      resourceType: 'customer',
      resourceId: customer.id,
    });

    return customer;
  });
}
