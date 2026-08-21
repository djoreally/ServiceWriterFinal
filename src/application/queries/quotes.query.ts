/**
 * Quotes Query — Read-only data access for quotes.
 * All write operations have been moved to quotes.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get current user */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

/** Fetch all data needed for the quotes page in parallel */
export async function fetchQuotesPageData() {
  return Promise.all([
    supabase.from("quotes").select("*").order("quote_date", { ascending: false }),
    supabase.from("customers").select("id, name"),
    supabase.from("vehicles").select("id, customer_id, make, model, year, vin"),
    supabase.from("inventory_items").select("id, name, sell_price"),
    supabase.from("service_catalog").select("id, name, description, default_price, labor_rate").eq("is_active", true).order("name"),
  ]);
}

/** Fetch quote items for a specific quote */
export async function fetchQuoteItems(quoteId: string) {
  return supabase.from("quote_items").select("*").eq("quote_id", quoteId);
}
