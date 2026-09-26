import 'server-only';

import { sql } from 'drizzle-orm';

import { domainEvents, eventDeliveries } from '@/db/schema';
import { getDb } from '@/db/client';

type Database = ReturnType<typeof getDb>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export type PublishDomainEventInput = {
  workspaceId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion?: number;
  payload?: Record<string, unknown>;
  traceId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  idempotencyKey: string;
};

export async function publishDomainEvent(tx: Transaction, input: PublishDomainEventInput) {
  const [event] = await tx
    .insert(domainEvents)
    .values({
      workspaceId: input.workspaceId,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      eventVersion: input.eventVersion ?? 1,
      payload: input.payload ?? {},
      occurredAt: sql`clock_timestamp()`,
      traceId: input.traceId ?? null,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      idempotencyKey: input.idempotencyKey,
    })
    .returning({ id: domainEvents.id });

  await tx.insert(eventDeliveries).values({
    eventId: event.id,
    availableAt: sql`clock_timestamp()`,
  });

  // Wake-up hint only. Durability is the committed outbox row above.
  await tx.execute(sql`select pg_notify('service_writer_domain_events', ${input.eventType})`);

  return event;
}
