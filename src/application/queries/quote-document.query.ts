/**
 * Quote Document Query — Fetches quote, items, customer, vehicle, and business data
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function fetchQuoteDocumentData(quoteId: string, customerId: string, vehicleId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const [quoteRes, itemsRes, customerRes, vehicleRes, businessRes] = await Promise.all([
    supabase.from("quotes").select("*").eq("id", quoteId).single(),
    supabase.from("quote_items").select("*").eq("quote_id", quoteId),
    supabase.from("customers").select("name, email, phone, address, created_at").eq("id", customerId).single(),
    supabase.from("vehicles").select("make, model, year, license_plate, vin, mileage, color, engine").eq("id", vehicleId).single(),
    supabase.from("business_profiles").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    quote: quoteRes.data,
    quoteItems: itemsRes.data || [],
    customer: customerRes.data,
    vehicle: vehicleRes.data,
    business: businessRes.data,
  };
}

export async function sendQuoteEmail(body: Record<string, unknown>): Promise<any> {
  return supabase.functions.invoke("send-email", {
    body: {
      source: "quote_document",
      ...body,
    },
  });
}
