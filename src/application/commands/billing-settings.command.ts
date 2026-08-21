/**
 * Billing Settings Commands — Stripe checkout for messaging add-ons.
 */
import { supabase } from "@/integrations/supabase/client";

export async function startMessagingAddonCheckout(bundleKey: string): Promise<{ url?: string }> {
  const { data, error } = await supabase.functions.invoke("create-messaging-addon-checkout", {
    body: { bundleKey },
  });
  if (error) throw error;
  return (data ?? {}) as { url?: string };
}
