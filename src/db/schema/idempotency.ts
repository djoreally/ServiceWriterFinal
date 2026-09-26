import {
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workspaces } from './core';

export const idempotencyRequestStatus = pgEnum('idempotency_request_status', [
  'pending',
  'completed',
]);

export const idempotencyRequests = pgTable(
  'idempotency_requests',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    commandName: varchar('command_name', { length: 128 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 256 }).notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),
    status: idempotencyRequestStatus('status').default('pending').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    resourceType: varchar('resource_type', { length: 64 }),
    resourceId: uuid('resource_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.workspaceId, table.commandName, table.idempotencyKey],
    }),
    createdAtIdx: index('idempotency_requests_created_at_idx').on(table.createdAt),
  }),
);
