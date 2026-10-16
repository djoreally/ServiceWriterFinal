import { apiClient } from "@/lib/api-client";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";

export type PublicBookingPaymentChoice = "pay_later" | "pay_now";

export interface PublicBookingCommitVehicle {
  client_id: string;
  year: string;
  make: string;
  model: string;
  license_plate?: string | null;
  vin?: string | null;
  mileage?: string | null;
  oil_type?: string | null;
  oil_capacity?: string | null;
  image_url?: string | null;
  engine?: string | null;
}

export interface PublicBookingCommitService {
  client_vehicle_id: string;
  service_catalog_id: string | null;
  name: string;
  /** Diagnostic only. Canonical catalog/dynamic price is resolved server-side. */
  price: number;
  quantity: number;
  is_prepaid: boolean;
}

export interface PublicBookingCommitRequest {
  booking_slug: string;
  idempotency_key: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  title: string;
  description: string;
  notes: string | null;
  /** Browser totals are evidence/debug values only; never financial authority. */
  client_estimated_cost: number;
  client_tax_amount: number;
  client_tax_rate: number;
  currency: string;
  payment_choice: PublicBookingPaymentChoice;
  coupon_code?: string | null;
  guest: {
    name: string;
    email: string;
    phone: string;
  };
  location: {
    address: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    lat: number | null;
    lng: number | null;
  };
  vehicles: PublicBookingCommitVehicle[];
  services: PublicBookingCommitService[];
  configuration: AppointmentBookingConfiguration;
}

export interface PublicBookingCommitResult {
  workspace_id: string;
  business_user_id: string;
  appointment_id: string;
  payment_id: string;
  payment_choice: PublicBookingPaymentChoice;
  customer_id?: string;
  vehicle_ids?: Record<string, string>;
  item_count?: number;
  idempotent?: boolean;
  financial_state: "canonical" | "pending" | "failed";
  financial_snapshot?: Record<string, unknown>;
  financial_error?: string;
  checkout_url: string | null;
  checkout_session_id?: string;
  card_fee_cents?: number;
  payment_status: "pending";
  checkout_error?: string;
}

export async function commitPublicBooking(
  request: PublicBookingCommitRequest,
): Promise<PublicBookingCommitResult> {
  const response = await apiClient.post<{
    data: PublicBookingCommitResult | null;
    error: { code?: string; message: string } | null;
  }>("/v1/public-bookings/commit", request);

  if (response.error) throw new Error(response.error.message);
  if (!response.data?.appointment_id || !response.data.payment_id) {
    throw new Error("BOOKING_COMMIT_INCOMPLETE");
  }
  return response.data;
}
