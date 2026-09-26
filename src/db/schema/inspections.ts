import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { workspaces } from './core';

export const inspectionTemplates = pgTable('inspection_templates', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(),
  isActive: boolean('is_active').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const inspectionItems = pgTable('inspection_items', {
  id: uuid('id').primaryKey(),
  templateId: uuid('template_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'),
  isRequired: boolean('is_required').notNull(),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const serviceInspections = pgTable('service_inspections', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  userId: uuid('user_id').notNull(),
  serviceId: uuid('service_id'),
  vehicleId: uuid('vehicle_id'),
  appointmentId: uuid('appointment_id'),
  templateId: uuid('template_id').notNull(),
  templateName: text('template_name').notNull(),
  inspectorName: text('inspector_name'),
  notes: text('notes'),
  status: text('status').notNull(),
  inspectionDate: timestamp('inspection_date', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const inspectionResults = pgTable('inspection_results', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  inspectionId: uuid('inspection_id').notNull(),
  itemName: text('item_name').notNull(),
  itemCategory: text('item_category'),
  status: text('status').notNull(),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const serviceRecommendations = pgTable('service_recommendations', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  appointmentId: uuid('appointment_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  inspectionId: uuid('inspection_id').notNull(),
  inspectionResultId: uuid('inspection_result_id'),
  serviceCatalogId: uuid('service_catalog_id'),
  description: text('description').notNull(),
  technicianNotes: text('technician_notes'),
  price: numeric('price'),
  status: text('status').notNull(),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  decidedBy: uuid('decided_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  appointmentItemId: uuid('appointment_item_id'),
});

export const serviceRecords = pgTable('service_records', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id),
  appointmentId: uuid('appointment_id'),
  workOrderId: uuid('work_order_id'),
  technicianId: uuid('technician_id'),
  completedBy: uuid('completed_by'),
  status: text('status').notNull(),
  complaint: text('complaint'),
  diagnosis: text('diagnosis'),
  workPerformed: text('work_performed'),
  oilQuartsUsed: numeric('oil_quarts_used'),
  customerNotes: text('customer_notes'),
  internalNotes: text('internal_notes'),
  metadata: jsonb('metadata').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  quoteId: uuid('quote_id'),
  subtotal: numeric('subtotal'),
  taxRate: numeric('tax_rate'),
  taxAmount: numeric('tax_amount'),
  discountAmount: numeric('discount_amount'),
  totalAmount: numeric('total_amount'),
  currencyCode: text('currency_code').notNull(),
  customerId: uuid('customer_id'),
  vehicleId: uuid('vehicle_id'),
});
