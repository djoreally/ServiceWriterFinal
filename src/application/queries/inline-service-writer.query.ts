/**
 * Inline Service Writer Queries — Read operations for the Command Center.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fetch service catalog and customers in parallel */
export async function fetchServiceWriterData(userId: string) {
  return Promise.all([
    supabase
      .from("service_catalog")
      .select("id, name, description, default_price, labor_rate, estimated_duration, category")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("customers")
      .select("id, name, email, phone, address")
      .eq("user_id", userId)
      .order("name")
      .limit(500),
  ]);
}
