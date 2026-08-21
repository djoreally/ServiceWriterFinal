/**
 * Quotes Commands — All write operations for quotes, line items, and conversion.
 * Extracted from quotes.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import type { Database } from "@/integrations/supabase/types";

type QuoteInsert = Database["public"]["Tables"]["quotes"]["Insert"];
type QuoteUpdate = Database["public"]["Tables"]["quotes"]["Update"];
type QuoteItemInsert = Database["public"]["Tables"]["quote_items"]["Insert"];

/** Create a new quote */
export async function createQuote(data: QuoteInsert) {
  return supabase.from("quotes").insert([data]).select().single();
}

/** Update an existing quote */
export async function updateQuote(id: string, data: QuoteUpdate) {
  return supabase.from("quotes").update(data).eq("id", id);
}

/** Delete a quote */
export async function deleteQuote(id: string) {
  return supabase.from("quotes").delete().eq("id", id);
}

/** Delete all line items for a quote */
export async function deleteQuoteItems(quoteId: string) {
  return supabase.from("quote_items").delete().eq("quote_id", quoteId);
}

/** Insert quote line items */
export async function insertQuoteItems(items: QuoteItemInsert[]) {
  return supabase.from("quote_items").insert(items);
}

/** Update quote status */
export async function updateQuoteStatus(id: string, status: string) {
  return supabase.from("quotes").update({ status }).eq("id", id);
}

/** Convert a quote into one canonical service record and its line items. */
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
    const response = await nextApi.quotes.convert(input.quoteId, {
      workspace_id,
      idempotency_key,
      service_date: input.serviceDate,
      technician_id: input.technicianId ?? null,
      appointment_id: input.appointmentId ?? null,
      work_order_id: input.workOrderId ?? null,
      internal_notes: input.internalNotes ?? null,
      expected_quote_updated_at: input.expectedQuoteUpdatedAt ?? null,
    });
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error("Quote conversion failed.") };
  }
}

/** Create a new customer inline from quotes page */
export async function createQuoteCustomer(userId: string, data: { name: string; email: string | null; phone: string | null }) {
  return supabase.from("customers").insert([{ user_id: userId, ...data }]).select().single();
}

/** Create a new vehicle inline from quotes page */
export async function createQuoteVehicle(userId: string, data: {
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  customer_id: string | null;
}) {
  return supabase.from("vehicles").insert([{ user_id: userId, ...data }]).select().single();
}
