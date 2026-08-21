/**
 * Soft Delete Utility Library
 * Sprint 1 Epic 1.1 - Story 1.1.2
 * 
 * Provides utilities for soft-deleting records instead of hard-deleting them.
 * This is critical for GDPR compliance, data retention policies, and audit trails.
 * 
 * Usage:
 * ```typescript
 * import { softDelete, hardDelete } from '@/lib/soft-delete';
 * 
 * // Soft delete (marks as deleted, keeps data)
 * await softDelete(supabase, 'customers', customerId);
 * 
 * // Hard delete (permanently removes data) - admin only
 * await hardDelete(supabase, 'customers', customerId);
 * ```
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Tables that support soft delete (have deleted_at column).
 * Keep in sync with supabase/functions/gdpr-account-deletion SOFT_DELETE_TABLES
 * and supabase/functions/account-hard-delete USER_DATA_TABLES.
 */
export const SOFT_DELETE_TABLES = [
  'customers',
  'customer_accounts',
  'appointments',
  'fleet_clients',
  'fleet_contacts',
  'fleet_vehicles',
  'technicians',
  'technician_documents',
  'vehicles',
  'audit_logs',
  'email_logs',
  'sms_logs',
  'newsletter_subscribers',
  'review_requests',
  'testimonials',
  // Remediated (GDPR coverage expansion)
  'payment_records',
  'invoices',
  'invoice_line_items',
  'services',
  'work_orders',
  'business_profiles',
  'email_settings',
  'customer_preferences',
] as const;

export type SoftDeleteTable = typeof SOFT_DELETE_TABLES[number];

/**
 * Soft delete a record by setting deleted_at timestamp
 * 
 * @param supabase - Supabase client instance
 * @param table - Table name (must support soft delete)
 * @param id - Record ID to soft delete
 * @returns Promise with error if operation failed
 * 
 * @example
 * ```typescript
 * const { error } = await softDelete(supabase, 'customers', customerId);
 * if (error) {
 *   console.error('Failed to delete customer:', error);
 * }
 * ```
 */
export async function softDelete(
  supabase: SupabaseClient,
  table: SoftDeleteTable,
  id: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null); // Prevent double-delete

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Soft delete multiple records by setting deleted_at timestamp
 * 
 * @param supabase - Supabase client instance
 * @param table - Table name (must support soft delete)
 * @param ids - Array of record IDs to soft delete
 * @returns Promise with error if operation failed and count of affected rows
 * 
 * @example
 * ```typescript
 * const { error, count } = await softDeleteMany(supabase, 'appointments', appointmentIds);
 * console.info(`Deleted ${count} appointments`);
 * ```
 */
export async function softDeleteMany(
  supabase: SupabaseClient,
  table: SoftDeleteTable,
  ids: string[]
): Promise<{ error: Error | null; count: number }> {
  try {
    const { error, count } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .in('id', ids)
      .is('deleted_at', null);

    if (error) {
      return { error: new Error(error.message), count: 0 };
    }

    return { error: null, count: count || 0 };
  } catch (err) {
    return { 
      error: err instanceof Error ? err : new Error(String(err)),
      count: 0 
    };
  }
}

/**
 * Restore a soft-deleted record by clearing deleted_at timestamp
 * 
 * @param supabase - Supabase client instance
 * @param table - Table name (must support soft delete)
 * @param id - Record ID to restore
 * @returns Promise with error if operation failed
 * 
 * @example
 * ```typescript
 * const { error } = await restoreDeleted(supabase, 'customers', customerId);
 * if (!error) {
 *   console.info('Customer restored successfully');
 * }
 * ```
 */
export async function restoreDeleted(
  supabase: SupabaseClient,
  table: SoftDeleteTable,
  id: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: null })
      .eq('id', id)
      .not('deleted_at', 'is', null); // Only restore deleted records

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Hard delete a record (permanently removes from database)
 * ⚠️ WARNING: This permanently deletes data. Only use for:
 * - Admin/compliance data purge requests (GDPR Right to Erasure)
 * - Cleaning up test data
 * - Data retention policy enforcement
 * 
 * @param supabase - Supabase client instance
 * @param table - Table name
 * @param id - Record ID to permanently delete
 * @returns Promise with error if operation failed
 * 
 * @example
 * ```typescript
 * // Only allow admin users to hard delete
 * if (isAdmin) {
 *   const { error } = await hardDelete(supabase, 'customers', customerId);
 *   if (!error) {
 *     console.info('Customer permanently deleted');
 *   }
 * }
 * ```
 */
export async function hardDelete(
  supabase: SupabaseClient,
  table: string,
  id: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Hard delete multiple records (permanently removes from database)
 * ⚠️ WARNING: This permanently deletes data. Use with extreme caution.
 * 
 * @param supabase - Supabase client instance
 * @param table - Table name
 * @param ids - Array of record IDs to permanently delete
 * @returns Promise with error if operation failed and count of affected rows
 */
export async function hardDeleteMany(
  supabase: SupabaseClient,
  table: string,
  ids: string[]
): Promise<{ error: Error | null; count: number }> {
  try {
    const { error, count } = await supabase
      .from(table)
      .delete()
      .in('id', ids);

    if (error) {
      return { error: new Error(error.message), count: 0 };
    }

    return { error: null, count: count || 0 };
  } catch (err) {
    return { 
      error: err instanceof Error ? err : new Error(String(err)),
      count: 0 
    };
  }
}

/**
 * Query helper to include soft-deleted records
 * Use this in admin views or audit trails
 * 
 * @example
 * ```typescript
 * // Regular query (excludes deleted)
 * const { data } = await supabase
 *   .from('customers')
 *   .select('*')
 *   .is('deleted_at', null);
 * 
 * // Admin query (includes deleted)
 * const { data: allCustomers } = await supabase
 *   .from('customers')
 *   .select('*, deleted_at');
 * ```
 */
export const withDeleted = {
  /**
   * Returns true if a record is soft-deleted
   */
  isDeleted: (record: { deleted_at?: string | null }): boolean => {
    return record.deleted_at !== null && record.deleted_at !== undefined;
  },

  /**
   * Filter array to only active (non-deleted) records
   */
  activeOnly: <T extends { deleted_at?: string | null }>(records: T[]): T[] => {
    return records.filter(r => !withDeleted.isDeleted(r));
  },

  /**
   * Filter array to only deleted records
   */
  deletedOnly: <T extends { deleted_at?: string | null }>(records: T[]): T[] => {
    return records.filter(r => withDeleted.isDeleted(r));
  },
};

/**
 * Utility to check if a table supports soft delete
 */
export function supportsSoftDelete(table: string): table is SoftDeleteTable {
  return SOFT_DELETE_TABLES.includes(table as SoftDeleteTable);
}
