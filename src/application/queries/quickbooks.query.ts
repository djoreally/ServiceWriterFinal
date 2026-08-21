/**
 * QuickBooks Query — Read operations for QBO integration settings.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function fetchQBOData() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return null;

  const [profileResp, logsResp, customersResp, invoicesResp, paymentsResp] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("qbo_enabled, qbo_realm_id, qbo_connected_at, qbo_sync_customers, qbo_sync_invoices, qbo_sync_payments, qbo_income_account_id, qbo_last_sync_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("qbo_sync_log")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10),
    supabase
      .from("qbo_entity_mappings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("entity_type", "customer"),
    supabase
      .from("qbo_entity_mappings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("entity_type", "invoice"),
    supabase
      .from("qbo_entity_mappings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("entity_type", "payment"),
  ]);

  return {
    profile: profileResp.data,
    syncLogs: logsResp.data || [],
    entityStats: {
      customers: customersResp.count ?? 0,
      invoices: invoicesResp.count ?? 0,
      payments: paymentsResp.count ?? 0,
    },
  };
}
