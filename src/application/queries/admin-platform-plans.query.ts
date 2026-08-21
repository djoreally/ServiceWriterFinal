/**
 * Admin Platform Plans Query — fetch and mutate platform plan data for the admin panel.
 */
import { supabase } from "@/integrations/supabase/client";

export async function fetchPlatformPlans() {
  return supabase.from("platform_plans").select("*").order("display_order");
}

export async function fetchSubscriptionStats() {
  return supabase
    .from("business_subscriptions")
    .select("plan_id, platform_plans!inner(name, price_cents)");
}

export async function togglePlatformPlanActive(planId: string, isActive: boolean) {
  return supabase
    .from("platform_plans")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", planId);
}

export async function updatePlatformPlan(planId: string, updates: Record<string, unknown>) {
  return supabase
    .from("platform_plans")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", planId);
}
