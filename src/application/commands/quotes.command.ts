/**
 * Quotes Commands — canonical workspace-scoped writes plus conversion.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the documents Hono router. Exported signatures
 * are unchanged.
 */
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types.production";
import { apiClient } from "@/lib/api-client";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

const createdCustomerSchema = z.object({ id: z.string().uuid() }).passthrough();
const createdVehicleSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid().nullable(),
  make: z.string(),
  model: z.string(),
  year: z.number(),
  vin: z.string().nullable(),
}).passthrough();

export type LegacyQuoteWrite = {
  customer_id?: string | null;
  vehicle_id?: string | null;
  quote_number?: string;
  quote_date?: string;
  valid_until?: string | null;
  description?: string;
  labor_hours?: number | null;
  labor_cost?: number | null;
  parts_cost?: number | null;
  total_cost?: number;
  status?: string;
  notes?: string | null;
  fleet_metadata?: Json;
  user_id?: string;
};

export type LegacyQuoteItemWrite = {
  quote_id: string;
  inventory_item_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
};

function canonicalStatus(status?: string): string {
  switch (status) {
    case "pending": return "draft";
    case "accepted": return "approved";
    case "rejected": return "declined";
    case "draft":
    case "sent":
    case "approved":
    case "declined":
    case "expired":
    case "converted": return status;
    default: return "draft";
  }
}

function object(value: Json | null | undefined): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

function metadataFromQuote(data: LegacyQuoteWrite, existing: Record<string, Json> = {}): Record<string, Json> {
  return {
    ...existing,
    ...(data.quote_number !== undefined ? { quote_number: data.quote_number } : {}),
    ...(data.quote_date !== undefined ? { quote_date: data.quote_date } : {}),
    ...(data.valid_until !== undefined ? { valid_until: data.valid_until } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.labor_hours !== undefined ? { labor_hours: data.labor_hours } : {}),
    ...(data.labor_cost !== undefined ? { labor_cost: data.labor_cost } : {}),
    ...(data.parts_cost !== undefined ? { parts_cost: data.parts_cost } : {}),
    ...(data.notes !== undefined ? { notes: data.notes } : {}),
    ...(data.fleet_metadata !== undefined ? { fleet_metadata: data.fleet_metadata } : {}),
  };
}

function currentWorkspace(): string {
  const workspaceId = getSelectedWorkspaceId();
  if (!workspaceId) throw new Error("Select a workspace before working with quotes.");
  return workspaceId;
}

export async function createQuote(data: LegacyQuoteWrite) {
  try {
    const workspace_id = currentWorkspace();
    if (!data.customer_id) return { data: null, error: new Error("Select or create a customer before creating a quote.") };
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) return { data: null, error: new Error("Not authenticated") };
    const total = Number(data.total_cost ?? 0);
    const response = await apiClient.post<{ data: unknown }>(`/v1/quotes`, {
      workspace_id,
      customer_id: data.customer_id,
      vehicle_id: data.vehicle_id || null,
      status: canonicalStatus(data.status),
      subtotal: total,
      tax_total: 0,
      total,
      expires_at: data.valid_until || null,
      created_by: user.id,
      metadata: metadataFromQuote(data),
    });
    return { data: response.data ?? null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to create quote") };
  }
}

export async function updateQuote(id: string, data: LegacyQuoteWrite) {
  try {
    const workspace_id = currentWorkspace();
    if (data.customer_id === null) return { data: null, error: new Error("A quote must belong to a customer.") };

    // The server reads the current row, rejects converted quotes, and merges
    // metadata_patch into the stored metadata — equivalent to the legacy
    // client-side merge.
    const updates: Record<string, unknown> = {
      workspace_id,
      metadata_patch: metadataFromQuote(data),
    };
    if (data.customer_id !== undefined) updates.customer_id = data.customer_id;
    if (data.vehicle_id !== undefined) updates.vehicle_id = data.vehicle_id || null;
    if (data.status !== undefined) updates.status = canonicalStatus(data.status);
    if (data.valid_until !== undefined) updates.expires_at = data.valid_until || null;
    if (data.total_cost !== undefined) {
      updates.subtotal = Number(data.total_cost);
      updates.tax_total = 0;
      updates.total = Number(data.total_cost);
    }
    const response = await apiClient.patch<{ data: unknown }>(`/v1/quotes/${encodeURIComponent(id)}`, updates);
    return { data: response.data ?? null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to update quote") };
  }
}

/** UI delete archives a quote without destroying its header or line-item history. */
export async function deleteQuote(id: string) {
  try {
    const workspace_id = currentWorkspace();
    const response = await apiClient.delete<{ data: unknown }>(
      `/v1/quotes/${encodeURIComponent(id)}`,
      { query: { workspace_id } },
    );
    return { data: response.data ?? null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to delete quote") };
  }
}

/** Draft-edit helper: line replacement is allowed before conversion. */
export async function deleteQuoteItems(quoteId: string) {
  try {
    const workspace_id = currentWorkspace();
    await apiClient.delete<{ data: null }>(
      `/v1/quotes/${encodeURIComponent(quoteId)}/items`,
      { query: { workspace_id } },
    );
    return { data: null, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to delete quote items") };
  }
}

export async function insertQuoteItems(items: LegacyQuoteItemWrite[]) {
  try {
    const workspace_id = currentWorkspace();
    const byQuote = new Map<string, LegacyQuoteItemWrite[]>();
    for (const item of items) {
      const group = byQuote.get(item.quote_id) ?? [];
      group.push(item);
      byQuote.set(item.quote_id, group);
    }
    const inserted: unknown[] = [];
    for (const [quoteId, group] of byQuote) {
      const response = await apiClient.post<{ data: unknown[] }>(
        `/v1/quotes/${encodeURIComponent(quoteId)}/items`,
        {
          workspace_id,
          items: group.map((item) => ({
            inventory_item_id: item.inventory_item_id ?? null,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
          })),
        },
      );
      inserted.push(...(response.data ?? []));
    }
    return { data: inserted, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to insert quote items") };
  }
}

export async function updateQuoteStatus(id: string, status: string) {
  const workspace_id = currentWorkspace();
  const canonical = canonicalStatus(status);
  if (canonical === "approved" || canonical === "declined") {
    try {
      const response = await apiClient.post<{ data: unknown }>(
        `/v1/quotes/${encodeURIComponent(id)}/status`,
        { workspace_id, status: canonical },
      );
      return { data: response.data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error("Failed to update quote status") };
    }
  }
  try {
    const response = await apiClient.patch<{ data: unknown }>(
      `/v1/quotes/${encodeURIComponent(id)}`,
      { workspace_id, status: canonical },
    );
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to update quote status") };
  }
}

export interface ConvertQuoteInput {
  quoteId: string;
  idempotencyKey?: string;
  serviceDate?: string;
  technicianId?: string | null;
  appointmentId?: string | null;
  workOrderId?: string | null;
  internalNotes?: string | null;
  expectedQuoteUpdatedAt?: string | null;
}

export async function convertQuoteToServiceRecord(input: ConvertQuoteInput): Promise<{ data: unknown | null; error: Error | null }> {
  const workspace_id = getSelectedWorkspaceId();
  if (!workspace_id) return { data: null, error: new Error("Select a workspace before converting a quote.") };
  const idempotency_key = input.idempotencyKey ?? crypto.randomUUID();
  try {
    const response = await apiClient.post<{ data: unknown }>(
      `/v1/quotes/${encodeURIComponent(input.quoteId)}/convert`,
      {
        workspace_id,
        idempotency_key,
        service_date: input.serviceDate,
        technician_id: input.technicianId ?? null,
        appointment_id: input.appointmentId ?? null,
        work_order_id: input.workOrderId ?? null,
        internal_notes: input.internalNotes ?? null,
        expected_quote_updated_at: input.expectedQuoteUpdatedAt ?? null,
      },
    );
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Quote conversion failed.") };
  }
}

function splitName(name: string): { first_name: string; last_name: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || "Customer", last_name: parts.join(" ") };
}

export async function createQuoteCustomer(_userId: string, data: { name: string; email: string | null; phone: string | null }) {
  try {
    const workspace_id = currentWorkspace();
    const response = await apiClient.post<{ data: unknown }>(`/v1/customers`, {
      workspace_id,
      ...splitName(data.name),
      email: data.email || undefined,
      phone: data.phone || undefined,
    });
    const row = createdCustomerSchema.parse(response.data);
    return { data: { ...row, name: data.name }, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to create customer") };
  }
}

export async function createQuoteVehicle(_userId: string, data: {
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  customer_id: string | null;
}) {
  try {
    const workspace_id = currentWorkspace();
    const response = await apiClient.post<{ data: unknown }>(`/v1/vehicles`, {
      workspace_id,
      ...data,
    });
    return { data: createdVehicleSchema.parse(response.data), error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Failed to create vehicle") };
  }
}
