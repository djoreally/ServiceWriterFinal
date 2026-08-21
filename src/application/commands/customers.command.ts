/**
 * Customers Command - Write operations for customers.
 *
 * Uses direct Supabase calls instead of the API server.
 * Sprint 1 Epic 1.1 - Updated to use soft delete for GDPR compliance
 */

import { supabase } from "@/integrations/supabase/client";
import { softDelete, hardDelete } from "@/lib/soft-delete";
import { requireWorkspaceOwnerUserId } from "@/application/tenant-workspace";

export interface CustomerWritePayload {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

export async function createCustomer(payload: CustomerWritePayload): Promise<void> {
  await createCustomerAndReturn(payload);
}

/** Same as createCustomer but returns the newly created row so callers (e.g. the
 *  invoice dialog's inline "+ New Customer" flow) can auto-select it. */
export async function createCustomerAndReturn(
  payload: CustomerWritePayload,
): Promise<{ id: string; name: string; email: string | null; phone: string | null }> {
  const ownerUserId = await requireWorkspaceOwnerUserId();

  const { data, error } = await supabase
    .from("customers")
    .insert([{ ...payload, user_id: ownerUserId }])
    .select("id, name, email, phone")
    .single();

  if (error) throw new Error(error.message);
  return data as { id: string; name: string; email: string | null; phone: string | null };
}

export async function updateCustomer(id: string, payload: CustomerWritePayload): Promise<void> {
  const { error } = await supabase
    .from("customers")
    .update(payload)
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await softDelete(supabase, "customers", id);
  if (!error) {
    return;
  }

  // Backward compatibility: some deployments do not yet have `deleted_at` on customers.
  // Fall back to hard delete so customer removal still works.
  const isDeletedAtSchemaIssue =
    error.message.includes("deleted_at") ||
    error.message.toLowerCase().includes("schema cache");

  if (!isDeletedAtSchemaIssue) {
    throw error;
  }

  const hardDeleteResult = await hardDelete(supabase, "customers", id);
  if (hardDeleteResult.error) throw hardDeleteResult.error;
}

/**
 * Permanently delete a customer (admin only)
 * ⚠️ WARNING: This permanently removes customer data
 * Only use for:
 * - GDPR Right to Erasure requests
 * - Admin data cleanup
 * - Compliance requirements
 */
export async function hardDeleteCustomer(id: string): Promise<void> {
  const { error } = await hardDelete(supabase, "customers", id);
  if (error) throw error;
}
