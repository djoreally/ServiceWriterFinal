/** Phone Coupons Query Layer — canonical workspace-backed reads. */
import { productionSupabase } from "@/integrations/supabase/client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
const db = productionSupabase as any;

export interface PhoneCouponOverride {
  id: string; customer_id: string; disabled: boolean;
  custom_discount_type: "percentage" | "fixed" | null;
  custom_discount_value: number | null; custom_min_order_amount: number | null;
  custom_description: string | null; notes: string | null;
}
export interface PhoneCouponCustomer { id: string; name: string | null; email: string | null; phone: string | null; }
export interface PhoneCouponData { userId: string; customers: PhoneCouponCustomer[]; overrides: PhoneCouponOverride[]; }

export async function fetchPhoneCouponData(): Promise<PhoneCouponData | null> {
  const { data: auth } = await getCurrentAuthUser();
  if (!auth.user) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const [customerRes, overrideRes] = await Promise.all([
    db.from("customers").select("id,first_name,last_name,company_name,email,phone").eq("workspace_id", context.workspaceId).not("phone", "is", null),
    db.from("phone_coupon_overrides").select("*").eq("workspace_id", context.workspaceId),
  ]);
  if (customerRes.error) throw customerRes.error;
  if (overrideRes.error) throw overrideRes.error;
  const customers = (customerRes.data ?? []).map((row: any) => ({
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
    email: row.email ?? null,
    phone: row.phone ?? null,
  })).sort((a: PhoneCouponCustomer, b: PhoneCouponCustomer) => (a.name || "").localeCompare(b.name || ""));
  return { userId: auth.user.id, customers, overrides: (overrideRes.data ?? []) as PhoneCouponOverride[] };
}
