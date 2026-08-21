/**
 * Smart Upsells Queries & Commands - CRUD for service catalog upsell items.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
async function requireUser() {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Authentication required");
  return user;
}

export interface UpsellItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  is_active: boolean;
  is_upsell: boolean;
}

export async function fetchUpsells(): Promise<UpsellItem[]> {
  const user = await requireUser();
  const { data } = await supabase
    .from("service_catalog")
    .select("id, name, description, default_price, is_active, is_upsell")
    .eq("user_id", user.id)
    .eq("is_upsell", true)
    .order("sort_order", { ascending: true })
    .order("name");
  return (data as UpsellItem[]) || [];
}

export async function updateUpsell(
  id: string,
  payload: { name: string; description: string | null; default_price: number; is_active: boolean }
): Promise<void> {
  const { error } = await supabase
    .from("service_catalog")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function toggleUpsellActive(id: string, currentlyActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("service_catalog")
    .update({ is_active: !currentlyActive })
    .eq("id", id);
  if (error) throw error;
}

export async function loadDefaultUpsellTemplates(
  existingNames: Set<string>
): Promise<number> {
  const user = await requireUser();

  const DEFAULT_UPSELLS = [
    { name: "Engine Air Filter", description: "Replace engine air filter to improve fuel efficiency and engine performance.", default_price: 24.99, category: "Add-ons" },
    { name: "Cabin Air Filter", description: "Replace cabin air filter for cleaner, fresher air inside the vehicle.", default_price: 29.99, category: "Add-ons" },
    { name: "Wiper Blade Replacement", description: "Replace front and rear wiper blades for clear visibility in all weather conditions.", default_price: 24.99, category: "Add-ons" },
  ];

  const toInsert = DEFAULT_UPSELLS.filter((t) => !existingNames.has(t.name.toLowerCase()));
  if (toInsert.length === 0) return 0;

  const { error } = await supabase.from("service_catalog").insert(
    toInsert.map((t) => ({ ...t, user_id: user.id, is_active: true, is_upsell: true }))
  );
  if (error) throw error;
  return toInsert.length;
}

export async function addUpsell(payload: {
  name: string;
  description: string | null;
  default_price: number;
}): Promise<void> {
  const user = await requireUser();
  const { error } = await supabase.from("service_catalog").insert([
    {
      user_id: user.id,
      ...payload,
      is_active: true,
      is_upsell: true,
      category: "Add-ons",
    },
  ]);
  if (error) throw error;
}
