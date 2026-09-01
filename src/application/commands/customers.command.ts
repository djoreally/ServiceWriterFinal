/**
 * Customers Command - Write operations for customers.
 *
 * Uses direct Supabase calls instead of the API server.
 * Sprint 1 Epic 1.1 - Updated to use soft delete for GDPR compliance
 */

import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { hardDelete } from "@/lib/soft-delete";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { invalidateCustomerOverview } from "@/application/queries/customers.query";
import { invalidateVehicleOverview } from "@/application/queries/vehicles.query";

export interface CustomerWritePayload {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
}

function requireSelectedWorkspaceId(): string {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before managing customers.");
  return workspaceId;
}

function splitCustomerName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first_name = parts.shift() || "Customer";
  const last_name = parts.join(" ") || "Record";
  return { first_name, last_name };
}

function invalidateCustomerRelatedCaches(workspaceId: string): void {
  invalidateCustomerOverview(workspaceId);
  invalidateVehicleOverview(workspaceId);
}

const customerResponseSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});

export async function createCustomer(payload: CustomerWritePayload): Promise<void> {
  await createCustomerAndReturn(payload);
}

/** Same as createCustomer but returns the newly created row so callers (e.g. the
 *  invoice dialog's inline "+ New Customer" flow) can auto-select it. */
export async function createCustomerAndReturn(
  payload: CustomerWritePayload,
): Promise<{ id: string; name: string; email: string | null; phone: string | null }> {
  const workspace_id = requireSelectedWorkspaceId();
  const response = await nextApi.customers.create({
    workspace_id,
    ...splitCustomerName(payload.name),
    email: payload.email || undefined,
    phone: payload.phone || undefined,
    address: payload.address || undefined,
    notes: payload.notes || undefined,
  });
  invalidateCustomerRelatedCaches(workspace_id);
  const customer = customerResponseSchema.parse(response.data);
  return {
    id: customer.id,
    name: [customer.first_name, customer.last_name].join(" "),
    email: customer.email ?? null,
    phone: customer.phone ?? null,
  };
}

export async function updateCustomer(id: string, payload: CustomerWritePayload): Promise<void> {
  const workspace_id = requireSelectedWorkspaceId();
  await nextApi.customers.update(id, {
    workspace_id,
    ...splitCustomerName(payload.name),
    email: payload.email,
    phone: payload.phone,
    address: payload.address,
    notes: payload.notes,
  });
  invalidateCustomerRelatedCaches(workspace_id);
}

export async function deleteCustomer(id: string): Promise<void> {
  const workspace_id = requireSelectedWorkspaceId();
  await nextApi.customers.remove(workspace_id, id);
  invalidateCustomerRelatedCaches(workspace_id);
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
  const workspace_id = requireSelectedWorkspaceId();
  const { error } = await hardDelete(supabase, "customers", id);
  if (error) throw error;
  invalidateCustomerRelatedCaches(workspace_id);
}
