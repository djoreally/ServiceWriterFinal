/**
 * Booking Submit Commands — Application-layer wrappers for all write
 * operations performed during the public booking flow. Keeps useBookingSubmit
 * free of direct Supabase references.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export interface UpsertCustomerParams {
  p_booking_slug: string;
  p_email: string;
  p_name: string;
  p_phone: string | null;
  p_address: string | null;
}

export async function upsertBookingCustomer(params: UpsertCustomerParams) {
  return supabase.rpc("public_booking_upsert_customer", params);
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

export interface UpsertBookingVehicleParams {
  p_booking_slug: string;
  p_customer_email: string;
  p_year: number;
  p_make: string;
  p_model: string;
  p_license_plate: string | null;
  p_vin: string | null;
  p_mileage: number | null;
  p_oil_type: string | null;
  p_oil_capacity: string | null;
  p_image_url: string | null;
  p_engine: string | null;
}

export async function upsertBookingVehicle(params: UpsertBookingVehicleParams) {
  return supabase.rpc("public_booking_upsert_vehicle", params);
}

// ---------------------------------------------------------------------------
// Appointment
// ---------------------------------------------------------------------------

export interface BookAppointmentSafeParams {
  p_booking_slug: string;
  p_scheduled_date: string;
  p_scheduled_time: string;
  p_duration_minutes: number;
  p_title: string;
  p_guest_name: string;
  p_guest_email: string;
  p_guest_phone: string | null;
  p_description: string;
  p_notes: string | null;
  p_estimated_cost: number;
  p_tax_amount: number;
  p_service_catalog_id: string | null;
  p_vehicle_id: string | null;
  p_status?: "confirmed" | "pending" | "scheduled";
}

export async function bookAppointmentSafe(params: BookAppointmentSafeParams) {
  return supabase.rpc("public_booking_book_appointment", {
    ...params,
    p_status: params.p_status ?? "confirmed",
  });
}

export async function assignVanByZip(userId: string, zipCode: string) {
  return supabase.rpc("assign_van_by_zip", { p_user_id: userId, p_zip_code: zipCode });
}

export async function updateBookingAppointment(
  appointmentId: string,
  payload: Record<string, unknown>,
) {
  return supabase.from("appointments").update(payload as never).eq("id", appointmentId);
}

export async function saveAppointmentBookingConfiguration(
  appointmentId: string,
  bookingSlug: string,
  configuration: AppointmentBookingConfiguration,
) {
  return supabase.rpc("public_booking_save_configuration", {
    p_booking_slug: bookingSlug,
    p_appointment_id: appointmentId,
    p_configuration: configuration,
  });
}

export async function reserveTireInventoryForAppointment(appointmentId:string,businessUserId:string,inventoryItemId:string,quantity:number){
  return supabase.rpc("reserve_tire_inventory_for_appointment" as never,{p_appointment_id:appointmentId,p_business_user_id:businessUserId,p_inventory_item_id:inventoryItemId,p_quantity:quantity} as never);
}

// ---------------------------------------------------------------------------
// Appointment services
// ---------------------------------------------------------------------------

export interface BookingServiceItem {
  vehicle_id?: string | null;
  service_catalog_id: string | null;
  name: string;
  price: number;
  quantity: number;
  is_prepaid: boolean;
}

export async function insertBookingAppointmentServices(
  appointmentId: string,
  bookingSlug: string,
  services: BookingServiceItem[],
) {
  return supabase.rpc("public_booking_insert_services", {
    p_booking_slug: bookingSlug,
    p_appointment_id: appointmentId,
    p_services: services as unknown as import("@/integrations/supabase/types").Json,
  });
}

// ---------------------------------------------------------------------------
// Payment record
// ---------------------------------------------------------------------------

export interface BookingPaymentRecordInput {
  user_id: string;
  appointment_id: string;
  booking_slug: string;
  amount: number;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  currency: string;
  status: string;
  payment_type: string;
  customer_email: string;
  customer_name: string;
}

/**
 * Record the pay-at-service intent for a public booking.
 *
 * `payment_records` has no anonymous insert policy (and must not have one), so
 * the write goes through a SECURITY DEFINER RPC that validates the appointment
 * is fresh, belongs to the business, and only ever writes a pending,
 * zero-collected intent row. Idempotent per appointment.
 */
export async function insertBookingPaymentRecord(record: BookingPaymentRecordInput) {
  const { data, error } = await supabase.rpc("public_booking_record_payment_intent_v2", {
    p_booking_slug: record.booking_slug,
    p_appointment_id: record.appointment_id,
    p_amount: Math.round(record.amount),
    p_subtotal: Math.round(record.subtotal),
    p_tax_amount: Math.round(record.tax_amount),
    p_tax_rate: record.tax_rate,
    p_currency: record.currency,
    p_customer_email: record.customer_email,
    p_customer_name: record.customer_name,
  });
  if (error) throw error;
  return { data: data ? { id: data as string } : null, error: null as null };
}


// ---------------------------------------------------------------------------
// Auth — booking-specific sign-up (redirects to /customer/dashboard)
// ---------------------------------------------------------------------------

export async function signUpBookingUser(
  email: string,
  password: string,
  fullName: string,
  phone?: string,
) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/customer/dashboard`,
      data: { full_name: fullName, phone },
    },
  });
}

export interface CreateCustomerAccountParams {
  p_user_id: string;
  p_email: string;
  p_full_name: string;
  p_phone: string | null;
  p_provider_id: string;
}

export async function createCustomerAccount(params: CreateCustomerAccountParams) {
  return supabase.rpc("create_customer_account", params);
}

// ---------------------------------------------------------------------------
// Consent capture
// ---------------------------------------------------------------------------

export interface BookingConsentInput {
  userId: string;
  customerId: string | null;
  email: string;
  phone: string | null;
  transactionalSmsConsent: boolean;
  marketingSmsConsent: boolean;
  marketingEmailConsent: boolean;
  consentTexts: {
    transactionalSms: string;
    marketingSms: string;
    marketingEmail: string;
  };
  source?: string;
  signature?: string;
  /**
   * Guest auth mode: the just-created appointment this consent belongs to. The
   * edge function verifies (service-role) that the appointment exists, belongs
   * to `userId`, matches `email`, and was created moments ago.
   */
  appointmentId?: string | null;
}

export async function recordBookingConsent(input: BookingConsentInput): Promise<any> {
  const { signature, ...body } = input;
  return supabase.functions.invoke("record-booking-consent", {
    body,
    headers: signature ? { "x-hmac-signature": signature } : {},
  });
}

// ---------------------------------------------------------------------------
// Booking rewards lookup
// ---------------------------------------------------------------------------

export interface BookingRewardLookupReward {
  instance_id?: string;
  reward_id: string;
  name: string;
  description: string | null;
  reward_type: string;
  program_id: string;
  program_name: string | null;
  status?: string;
  expires_at?: string | null;
  points_required?: number;
  points_remaining?: number;
  config?: Record<string, unknown> | null;
}

export interface BookingRewardLookupResult {
  status: string;
  match_source?: string | null;
  masked_email?: string | null;
  candidate_count?: number;
  points_balance: number;
  lifetime_points_earned?: number;
  visit_count?: number;
  available_rewards: BookingRewardLookupReward[];
  catalog: BookingRewardLookupReward[];
}

export async function lookupBookingRewards(
  providerId: string,
  email: string,
): Promise<BookingRewardLookupResult> {
  const { data, error } = await supabase.rpc("lookup_booking_rewards", {
    p_provider_id: providerId,
    p_email: email,
    p_customer_account_id: undefined,
  });
  if (error) throw new Error(error.message);

  const payload = (data || {}) as Partial<BookingRewardLookupResult>;
  return {
    status: payload.status || "no_match",
    match_source: payload.match_source ?? null,
    masked_email: payload.masked_email ?? null,
    candidate_count: payload.candidate_count,
    points_balance: Number(payload.points_balance || 0),
    lifetime_points_earned: Number(payload.lifetime_points_earned || 0),
    visit_count: Number(payload.visit_count || 0),
    available_rewards: payload.available_rewards || [],
    catalog: payload.catalog || [],
  };
}

// ---------------------------------------------------------------------------
// Booking reward reservation / redemption
// ---------------------------------------------------------------------------

export interface BookingRewardLifecycleResult {
  status: string;
  reason?: string;
  reward_instance_id?: string;
  appointment_id?: string;
  discount_cents?: number;
  reservation_expires_at?: string;
  idempotent?: boolean;
}

export async function reserveBookingReward(params: {
  rewardInstanceId: string;
  appointmentId: string;
  providerId: string;
  customerEmail: string;
  idempotencyKey?: string;
  reservationMinutes?: number;
}): Promise<BookingRewardLifecycleResult> {
  const { data, error } = await supabase.rpc("reserve_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId,
    p_provider_id: params.providerId,
    p_customer_email: params.customerEmail,
    p_idempotency_key: params.idempotencyKey,
    p_reservation_minutes: params.reservationMinutes ?? 30,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as BookingRewardLifecycleResult;
}

export async function applyBookingReward(params: {
  rewardInstanceId: string;
  appointmentId: string;
  paymentRecordId?: string | null;
  subtotalCents: number;
  taxCents: number;
  idempotencyKey?: string;
}): Promise<BookingRewardLifecycleResult> {
  const { data, error } = await supabase.rpc("apply_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId,
    p_payment_record_id: params.paymentRecordId ?? undefined,
    p_subtotal_cents: params.subtotalCents,
    p_tax_cents: params.taxCents,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as BookingRewardLifecycleResult;
}

export async function redeemBookingReward(params: {
  rewardInstanceId: string;
  appointmentId: string;
  paymentRecordId?: string | null;
  idempotencyKey?: string;
}): Promise<BookingRewardLifecycleResult> {
  const { data, error } = await supabase.rpc("redeem_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId,
    p_payment_record_id: params.paymentRecordId ?? undefined,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as BookingRewardLifecycleResult;
}

export async function cancelBookingReward(params: {
  rewardInstanceId: string;
  appointmentId?: string | null;
  reason?: string;
}): Promise<BookingRewardLifecycleResult> {
  const { data, error } = await supabase.rpc("cancel_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId ?? undefined,
    p_reason: params.reason ?? "booking_cancelled_or_failed",
  });
  if (error) throw new Error(error.message);
  return (data || { status: "skipped", reason: "empty_response" }) as unknown as BookingRewardLifecycleResult;
}

// ---------------------------------------------------------------------------
// Vehicle tire specification (tire vertical)
// ---------------------------------------------------------------------------

export interface SetVehicleTireSpecParams {
  p_booking_slug: string;
  p_customer_email: string;
  p_vehicle_id: string;
  p_tire_size: string | null;
  p_tire_size_source?: string | null;
  p_tire_size_front?: string | null;
  p_tire_size_rear?: string | null;
  p_tire_load_index?: string | null;
  p_tire_speed_rating?: string | null;
}

/**
 * Persist the wheel/tire configurator result on the vehicle record so tire
 * appointments carry the confirmed tire size (OE or customer override).
 */
export async function setVehicleTireSpec(params: SetVehicleTireSpecParams) {
  return supabase.rpc("public_booking_set_vehicle_tire_spec_v2", {
    p_booking_slug: params.p_booking_slug,
    p_customer_email: params.p_customer_email,
    p_vehicle_id: params.p_vehicle_id,
    p_tire_size: params.p_tire_size,
    p_tire_size_source: params.p_tire_size_source ?? null,
    p_tire_size_front: params.p_tire_size_front ?? null,
    p_tire_size_rear: params.p_tire_size_rear ?? null,
    p_tire_load_index: params.p_tire_load_index ?? null,
    p_tire_speed_rating: params.p_tire_speed_rating ?? null,
  });
}
