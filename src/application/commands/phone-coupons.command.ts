/** Phone Coupons Commands — workspace-scoped override writes. */
import { productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface PhoneCouponOverrideInput {
  disabled?: boolean;
  custom_discount_type?: "percentage" | "fixed" | null;
  custom_discount_value?: number | null;
  custom_min_order_amount?: number | null;
  custom_description?: string | null;
  notes?: string | null;
}

async function requireContext() {
  const { data: auth } = await getCurrentAuthUser();
  if (!auth.user) throw new Error("Not authenticated");
  const workspace = await resolveCurrentWorkspace();
  if (!workspace) throw new Error("No active workspace is available.");
  return { userId: auth.user.id, workspaceId: workspace.workspaceId };
}

export async function upsertPhoneCouponOverride(customerId: string, payload: PhoneCouponOverrideInput): Promise<void> {
  const { userId, workspaceId } = await requireContext();
  const row = {
    workspace_id: workspaceId,
    user_id: userId,
    customer_id: customerId,
    disabled: payload.disabled ?? false,
    custom_discount_type: payload.custom_discount_type ?? null,
    custom_discount_value: payload.custom_discount_value ?? null,
    custom_min_order_amount: payload.custom_min_order_amount ?? null,
    custom_description: payload.custom_description ?? null,
    notes: payload.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("phone_coupon_overrides").upsert(row, { onConflict: "workspace_id,customer_id" });
  if (error) throw error;
}

export async function deletePhoneCouponOverride(overrideId: string): Promise<void> {
  const { workspaceId } = await requireContext();
  const { error } = await db.from("phone_coupon_overrides").delete().eq("workspace_id", workspaceId).eq("id", overrideId);
  if (error) throw error;
}
