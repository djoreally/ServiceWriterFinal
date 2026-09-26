import {
  bigint,
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { customers, vehicles, workspaces } from './core';

export const appointmentStatus = pgEnum('appointment_status', [
  'requested','confirmed','checked_in','in_progress','completed','cancelled','no_show',
]);
export const workOrderStatus = pgEnum('work_order_status', [
  'draft','scheduled','assigned','in_progress','waiting_for_parts','awaiting_approval','completed','cancelled',
]);
export const workOrderPriority = pgEnum('work_order_priority', ['low','normal','high','urgent']);
export const invoiceStatus = pgEnum('invoice_status', ['draft','issued','partially_paid','paid','void','past_due']);
export const paymentStatus = pgEnum('payment_status', ['pending','succeeded','failed','refunded','partially_refunded']);
export const integrationProvider = pgEnum('integration_provider', [
  'stripe','square','quickbooks','google_calendar','resend','sms','carfax','mapbox','ai','other','enginemailer',
]);

export const serviceCatalog = pgTable('service_catalog', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  estimatedMinutes: integer('estimated_minutes'),
  laborPrice: numeric('labor_price').default('0').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
  inspectionTemplateId: uuid('inspection_template_id'),
});

export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull(),
  vehicleId: uuid('vehicle_id'),
  locationId: uuid('location_id'),
  assignedUserId: uuid('assigned_user_id'),
  status: appointmentStatus('status').default('requested').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  source: text('source').default('staff').notNull(),
  confirmationCode: text('confirmation_code'),
  notes: text('notes'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

export const workOrders = pgTable('work_orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  appointmentId: uuid('appointment_id'),
  customerId: uuid('customer_id').notNull(),
  vehicleId: uuid('vehicle_id'),
  locationId: uuid('location_id'),
  status: workOrderStatus('status').default('draft').notNull(),
  priority: workOrderPriority('priority').default('normal').notNull(),
  number: bigint('number', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  complaint: text('complaint'),
  diagnosis: text('diagnosis'),
  technicianNotes: text('technician_notes'),
  openedAt: timestamp('opened_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

export const workOrderItems = pgTable('work_order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  workOrderId: uuid('work_order_id').notNull(),
  serviceCatalogId: uuid('service_catalog_id'),
  itemType: text('item_type').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity').default('1').notNull(),
  unitPrice: numeric('unit_price').default('0').notNull(),
  taxRate: numeric('tax_rate').default('0').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const quotes = pgTable('quotes', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  customerId: uuid('customer_id').notNull(),
  vehicleId: uuid('vehicle_id'),
  workOrderId: uuid('work_order_id'),
  status: text('status').default('draft').notNull(),
  subtotal: numeric('subtotal').default('0').notNull(),
  taxTotal: numeric('tax_total').default('0').notNull(),
  total: numeric('total').default('0').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

export const quoteItems = pgTable('quote_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  quoteId: uuid('quote_id').notNull(),
  description: text('description').notNull(),
  quantity: numeric('quantity').default('1').notNull(),
  unitPrice: numeric('unit_price').default('0').notNull(),
  totalPrice: numeric('total_price').default('0').notNull(),
  inventoryItemId: uuid('inventory_item_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id').notNull(),
  vehicleId: uuid('vehicle_id'),
  workOrderId: uuid('work_order_id'),
  status: invoiceStatus('status').default('draft').notNull(),
  invoiceNumber: bigint('invoice_number', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  subtotal: numeric('subtotal').default('0').notNull(),
  taxTotal: numeric('tax_total').default('0').notNull(),
  total: numeric('total').default('0').notNull(),
  amountPaid: numeric('amount_paid').default('0').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  invoiceId: uuid('invoice_id'),
  customerId: uuid('customer_id'),
  provider: integrationProvider('provider'),
  providerPaymentId: text('provider_payment_id'),
  status: paymentStatus('status').default('pending').notNull(),
  amount: numeric('amount').notNull(),
  currencyCode: char('currency_code', { length: 3 }).default('USD').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});
