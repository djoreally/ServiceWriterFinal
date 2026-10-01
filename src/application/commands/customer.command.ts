import { apiClient, ApiClientError } from "@/lib/api-client";

export interface PhoneCouponConfig {
  id: string;
  title: string;
  description: string;
  discount_percent: number | null;
  max_discount_amount: number | null;
  points_required: number;
  min_booking_value: number;
}

export interface CustomerCouponValidation {
  valid: boolean;
  code: string;
  discount_type: string;
  discount_value: number;
  max_discount: number | null;
  message: string;
}

export async function claimPhoneCoupon(couponId: string): Promise<{ code: string }> {
  const { data } = await apiClient.post<{ data: { code: string } }>("/v1/crm/phone-coupons/overrides", {
    coupon_id: couponId,
  });
  return data;
}

export async function redeemPhoneCoupon(redemptionId: string): Promise<void> {
  await apiClient.delete(`/v1/crm/phone-coupons/overrides/${redemptionId}`);
}

export async function validateCouponCode(
  code: string,
  subtotal: number,
  options?: { serviceSlug?: string | null; coupon?: unknown },
): Promise<CustomerCouponValidation> {
  const trimmed = code.trim();
  const providedCoupon = (options?.coupon ?? null) as { id?: string } | null;
  if (!trimmed && !providedCoupon?.id) {
    throw new Error("Enter a coupon code to validate it.");
  }

  try {
    const { data } = await apiClient.get<{ data: any }>("/v1/crm/coupons/validate", {
      query: {
        code: trimmed,
        subtotal: String(subtotal),
        ...(providedCoupon?.id ? { coupon_id: providedCoupon.id } : {}),
        ...(options?.serviceSlug ? { service_slug: options.serviceSlug } : {}),
      },
    });
    return {
      valid: true,
      code: String(data.code ?? trimmed.toUpperCase()),
      discount_type: String(data.discount_type ?? "percentage"),
      discount_value: Number(data.discount_value ?? 0),
      max_discount: data.max_discount != null ? Number(data.max_discount) : null,
      message: `Coupon "${data.code ?? trimmed.toUpperCase()}" applied successfully!`,
    };
  } catch (error) {
    if (error instanceof ApiClientError) {
      // The min-order message is formatted server-side; apiClient surfaces
      // error code + message only.
      throw new Error(error.message || "Could not validate coupon. Please try again.");
    }
    throw new Error("Could not validate coupon. Please try again.");
  }
}

export async function getCouponConfigs(): Promise<PhoneCouponConfig[]> {
  const { data } = await apiClient.get<{ data: PhoneCouponConfig[] }>("/v1/crm/phone-coupons");
  return data;
}

export async function getCouponConfigsAdmin(): Promise<PhoneCouponConfig[]> {
  const { data } = await apiClient.get<{ data: PhoneCouponConfig[] }>("/v1/crm/phone-coupons", {
    query: { include_inactive: "true" },
  });
  return data;
}

export async function signUpCustomer(params: {
  email: string;
  password: string;
  name: string;
}) {
  throw new Error("Not implemented: signUpCustomer still requires a browser Supabase auth client.");
}

export async function signInCustomer(params: { email: string; password: string }) {
  throw new Error("Not implemented: signInCustomer still requires a browser Supabase auth client.");
}

export async function getCurrentCustomer() {
  throw new Error("Not implemented: getCurrentCustomer still requires a browser Supabase auth client.");
}

export async function updateCustomerProfile(params: { name: string; phone?: string }) {
  const { data } = await apiClient.patch<{ data: any }>("/v1/crm/customer-portal/account", {
    account_id: null,
    full_name: params.name,
    phone: params.phone ?? null,
  });
  return data;
}
