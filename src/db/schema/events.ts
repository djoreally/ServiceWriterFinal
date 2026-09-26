import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workspaces } from './core';

export const eventDeliveryStatus = pgEnum('event_delivery_status', [
  'pending',
  'processing',
  'completed',
  'dead_letter',
]);

export const eventConsumerStatus = pgEnum('event_consumer_status', [
  'started',
  'confirmed',
  'completed',
  'ambiguous',
  'failed',
]);

export const domainEvents = pgTable(
  'domain_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
    aggregateType: varchar('aggregate_type', { length: 64 }).notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: varchar('event_type', { length: 128 }).notNull(),
    eventVersion: integer('event_version').default(1).notNull(),
    payload: jsonb('payload').default({}).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    traceId: varchar('trace_id', { length: 128 }),
    correlationId: uuid('correlation_id'),
    causationId: uuid('causation_id'),
    idempotencyKey: varchar('idempotency_key', { length: 256 }).notNull(),
  },
  (table) => ({
    idempotencyKeyUnique: uniqueIndex('domain_events_workspace_idempotency_uidx').on(table.workspaceId, table.idempotencyKey),
    aggregateTimeline: index('domain_events_aggregate_timeline_idx').on(
      table.workspaceId,
      table.aggregateType,
      table.aggregateId,
      table.occurredAt,
    ),
    correlation: index('domain_events_correlation_idx').on(table.correlationId),
  }),
);

export const eventDeliveries = pgTable(
  'event_deliveries',
  {
    eventId: uuid('event_id').primaryKey().references(() => domainEvents.id, { onDelete: 'cascade' }),
    status: eventDeliveryStatus('status').default('pending').notNull(),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 128 }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(5).notNull(),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    leaseLookup: index('event_deliveries_lease_idx').on(table.status, table.lockedAt),
  }),
);

export const eventConsumerExecutions = pgTable(
  'event_consumer_executions',
  {
    eventId: uuid('event_id').notNull().references(() => domainEvents.id, { onDelete: 'cascade' }),
    consumerName: varchar('consumer_name', { length: 128 }).notNull(),
    status: eventConsumerStatus('status').default('started').notNull(),
    externalIdempotencyKey: varchar('external_idempotency_key', { length: 256 }),
    providerReference: text('provider_reference'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').default(0).notNull(),
    lastError: text('last_error'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.consumerName] }),
  }),
);
