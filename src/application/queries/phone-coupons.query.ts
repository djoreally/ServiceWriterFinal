/** Phone Coupons Query Layer — canonical workspace-backed reads via the Hono billing API. */
import { apiClient, ApiClientError } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface PhoneCouponOverride {
  id: string; customer_id: string; disabled: boolean;
  custom_discount_type: "percentage" | "fixed" | null;
  custom_discount_value: number | null; custom_min_order_amount: number | null;
  custom_description: string | null; notes: string | null;
}
export interface PhoneCouponCustomer { id: string; name: string | null; email: string | null; phone: string | null; }
export interface PhoneCouponData { userId: string; customers: PhoneCouponCustomer[]; overrides: PhoneCouponOverride[]; }

interface PhoneCouponCustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
}

export async function fetchPhoneCouponData(): Promise<PhoneCouponData | null> {
  const { data: auth } = await getCurrentAuthUser();
  if (!auth.user) return null;
  try {
    const { data } = await apiClient.get<{
      data: { customers: PhoneCouponCustomerRow[]; overrides: PhoneCouponOverride[] };
    }>("/v1/billing/phone-coupons");
    const customers = (data.customers ?? []).map((row) => ({
      id: row.id,
      name: [row.first_name, row.last_name].filter(Boolean).join(" ") || row.company_name || "Customer",
      email: row.email ?? null,
      phone: row.phone ?? null,
    })).sort((a: PhoneCouponCustomer, b: PhoneCouponCustomer) => (a.name || "").localeCompare(b.name || ""));
    return { userId: auth.user.id, customers, overrides: data.overrides ?? [] };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "workspace_missing") return null;
    throw error instanceof ApiClientError ? new Error(error.message) : error;
  }
}
