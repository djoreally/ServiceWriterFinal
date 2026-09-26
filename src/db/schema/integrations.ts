import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { integrationProvider } from './domain';
import { workspaces } from './core';
import { profiles } from './settings';

export const providerConnections = pgTable(
  'provider_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    provider: integrationProvider('provider').notNull(),
    externalAccountId: text('external_account_id'),
    status: text('status').default('connected').notNull(),
    scopes: text('scopes').array().default([]).notNull(),
    secretReference: text('secret_reference'),
    metadata: jsonb('metadata').default({}).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceProviderUnique: unique('provider_connections_workspace_id_provider_key')
      .on(table.workspaceId, table.provider),
  }),
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    provider: integrationProvider('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureVerified: boolean('signature_verified').default(false).notNull(),
    status: text('status').default('received').notNull(),
    payload: jsonb('payload').notNull(),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => ({
    providerEventUnique: unique('webhook_events_provider_external_event_id_key')
      .on(table.provider, table.externalEventId),
  }),
);
