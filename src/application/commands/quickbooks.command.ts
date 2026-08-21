/**
 * QuickBooks Commands — Write operations for QBO integration.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export async function saveQBOSettings(settings: {
  qbo_sync_customers: boolean;
  qbo_sync_invoices: boolean;
  qbo_sync_payments: boolean;
  qbo_income_account_id: string | null;
}) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Not authenticated");

  return supabase
    .from("business_profiles")
    .update(settings)
    .eq("user_id", user.id);
}

export async function invokeQBOConnect(): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("qbo-connect", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

export async function invokeQBODisconnect(): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("qbo-disconnect", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}

export async function invokeQBOSync(entityType?: string): Promise<any> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  return supabase.functions.invoke("qbo-sync", {
    body: { entityType: entityType || "all" },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
}
