import { supabase } from "@/integrations/supabase/client";

export async function fetchRewardsProductionHealth(providerId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("get_rewards_production_health", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}

export async function validateRewardsLaunchSignoff(providerId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("validate_rewards_launch_signoff", { p_provider_id: providerId });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, unknown>;
}
