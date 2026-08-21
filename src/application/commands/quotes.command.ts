/**
 * Quotes Commands — All write operations for quotes, line items, and conversion.
 * Extracted from quotes.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type QuoteInsert = Database["public"]["Tables"]["quotes"]["Insert"];
type QuoteUpdate = Database["public"]["Tables"]["quotes"]["Update"];
type QuoteItemInsert = Database["public"]["Tables"]["quote_items"]["Insert"];
type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];
type LaborItemInsert = Database["public"]["Tables"]["labor_items"]["Insert"];
type ServiceItemInsert = Database["public"]["Tables"]["service_items"]["Insert"];

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

/** Create a service record from a quote (conversion) */
export async function createServiceFromQuote(data: ServiceInsert) {
  return supabase.from("services").insert([data]).select("id").single();
}

/** Insert labor items for a converted quote */
export async function insertLaborItems(items: LaborItemInsert[]) {
  return supabase.from("labor_items").insert(items);
}

/** Insert service items for a converted quote */
export async function insertServiceItems(items: ServiceItemInsert[]) {
  return supabase.from("service_items").insert(items);
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
