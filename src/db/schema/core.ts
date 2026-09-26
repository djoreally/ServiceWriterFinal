import {
  boolean,
  char,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const appRole = pgEnum('app_role', ['admin', 'moderator', 'user']);
export const workspaceKind = pgEnum('workspace_kind', ['shop', 'fleet', 'hybrid']);
export const memberRole = pgEnum('member_role', [
  'owner',
  'admin',
  'manager',
  'service_advisor',
  'technician',
  'dispatcher',
  'receptionist',
  'fleet_manager',
  'viewer',
  'customer',
]);
export const customerStatus = pgEnum('customer_status', ['active', 'inactive', 'archived']);
export const vehicleStatus = pgEnum('vehicle_status', ['active', 'inactive', 'sold', 'archived']);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  kind: workspaceKind('kind').default('shop').notNull(),
  appRole: appRole('app_role').default('user').notNull(),
  legalName: text('legal_name'),
  timezone: text('timezone').default('UTC').notNull(),
  currencyCode: char('currency_code', { length: 3 }).default('USD').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull(),
    role: memberRole('role').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  }),
);

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  status: customerStatus('status').default('active').notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  companyName: text('company_name'),
  email: text('email'),
  phone: text('phone'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  city: text('city'),
  region: text('region'),
  postalCode: text('postal_code'),
  countryCode: char('country_code', { length: 2 }).default('US').notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});

export const vehicles = pgTable('vehicles', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id'),
  status: vehicleStatus('status').default('active').notNull(),
  vin: text('vin'),
  year: smallint('year'),
  make: text('make'),
  model: text('model'),
  trim: text('trim'),
  licensePlate: text('license_plate'),
  plateRegion: text('plate_region'),
  color: text('color'),
  mileage: integer('mileage'),
  mileageUnit: text('mileage_unit').default('mi').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').default({}).notNull(),
});
