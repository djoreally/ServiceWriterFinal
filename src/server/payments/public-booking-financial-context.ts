import { ApiError } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { bankersRound, type FeeSettings } from "@/lib/financialMath";

export type PublicBookingDiscountKind = "coupon" | "phone_coupon";

export interface PublicBookingValidatedDiscount {
  kind: PublicBookingDiscountKind;
  sourceId: string;
  code: string | null;
  discountType: "percentage" | "fixed";
  configuredValue: number;
  amountDollars: number;
  description: string | null;
  minOrderDollars: number;
  validatedAt: string;
}

export interface PublicBookingFinancialContext {
  workspaceId: string;
  appointmentId: string;
  customerId: string;
  vehicleId: string | null;
  locationId: string;
  itemSubtotalDollars: number;
  hasOilService: boolean;
  discount: PublicBookingValidatedDiscount | null;
  feeSettings: FeeSettings;
  tax: {
    provider: "manual" | "stripe";
    ratePercent: number;
    paymentProvider: string | null;
    operationalSettings: Record<string, unknown>;
    currencyCode: string;
    location: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
  };
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNonNegative(name: string, value: unknown): number {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0) {
    throw new ApiError(500, `${name} is invalid.`, "financial_configuration_invalid");
  }
  return number;
}

function percentage(name: string, value: unknown): number {
  const number = finiteNonNegative(name, value);
  if (number > 100) {
    throw new ApiError(500, `${name} must be less than or equal to 100.`, "financial_configuration_invalid");
  }
  return number;
}

function feeType(name: string, value: unknown): "fixed" | "percentage" {
  const type = text(value) || "fixed";
  if (type !== "fixed" && type !== "percentage") {
    throw new ApiError(500, `${name} is invalid.`, "financial_configuration_invalid");
  }
  return type;
}

function itemIsBillable(metadataValue: unknown): boolean {
  const metadata = record(metadataValue);
  return !(
    metadata.source === "inspection_recommendation"
    && metadata.work_resolution === "unable_to_complete"
  );
}

function catalogRecord(value: unknown): JsonRecord {
  if (Array.isArray(value)) return record(value[0]);
  return record(value);
}

function itemLooksLikeOilService(item: JsonRecord): boolean {
  const catalog = catalogRecord(item.service_catalog);
  const haystack = [
    text(item.description),
    text(catalog.name),
    text(catalog.category),
  ].join(" ").toLowerCase();
  return haystack.includes("oil");
}

function normalizePhoneDigits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function configuredDate(name: string, value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new ApiError(500, `${name} is invalid.`, "discount_configuration_invalid");
  }
  return date;
}

function discountAmount(
  subtotal: number,
  discountType: string,
  configuredValue: number,
): number {
  if (discountType === "percentage") {
    return bankersRound(subtotal * (percentage("discount.percentage", configuredValue) / 100), 2);
  }
  if (discountType === "fixed") {
    return bankersRound(Math.min(configuredValue, subtotal), 2);
  }
  throw new ApiError(409, "Discount configuration is invalid.", "discount_configuration_invalid");
}

function validateRegularCoupon(params: {
  rows: JsonRecord[];
  requestedCode: string;
  subtotal: number;
  now: Date;
}): PublicBookingValidatedDiscount | null {
  const requested = params.requestedCode.trim().toLowerCase();
  const coupon = params.rows.find((row) => text(row.code).toLowerCase() === requested);
  if (!coupon) return null;

  const validFrom = configuredDate("coupon.valid_from", coupon.valid_from);
  const validUntil = configuredDate("coupon.valid_until", coupon.valid_until);
  if (validFrom && validFrom > params.now) {
    throw new ApiError(409, "This coupon is not yet valid.", "coupon_not_active");
  }
  if (validUntil && validUntil < params.now) {
    throw new ApiError(409, "This coupon has expired.", "coupon_expired");
  }

  const maxUses = coupon.max_uses === null || coupon.max_uses === undefined
    ? null
    : Number(coupon.max_uses);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 0)) {
    throw new ApiError(500, "coupon.max_uses is invalid.", "discount_configuration_invalid");
  }
  const usedCount = finiteNonNegative("coupon.used_count", coupon.used_count);
  if (!Number.isInteger(usedCount)) {
    throw new ApiError(500, "coupon.used_count is invalid.", "discount_configuration_invalid");
  }
  if (maxUses !== null && usedCount >= maxUses) {
    throw new ApiError(409, "This coupon has reached its usage limit.", "coupon_usage_exhausted");
  }

  const minOrder = finiteNonNegative("coupon.min_order_amount", coupon.min_order_amount);
  if (params.subtotal < minOrder) {
    throw new ApiError(409, "The booking does not meet this coupon's minimum order.", "coupon_minimum_not_met");
  }

  const type = text(coupon.discount_type);
  const value = finiteNonNegative("coupon.discount_value", coupon.discount_value);
  const id = text(coupon.id);
  if (!id) throw new ApiError(500, "Coupon identity is invalid.", "discount_configuration_invalid");

  return {
    kind: "coupon",
    sourceId: id,
    code: text(coupon.code),
    discountType: type as "percentage" | "fixed",
    configuredValue: value,
    amountDollars: discountAmount(params.subtotal, type, value),
    description: text(coupon.description) || null,
    minOrderDollars: minOrder,
    validatedAt: params.now.toISOString(),
  };
}

async function validatePhoneCoupon(params: {
  db: any;
  workspaceId: string;
  customerId: string;
  customerPhone: string;
  requestedCode: string;
  subtotal: number;
  operationalSettings: JsonRecord;
  now: Date;
}): Promise<PublicBookingValidatedDiscount | null> {
  if (params.operationalSettings.phone_as_coupon_enabled !== true) return null;

  const requestedDigits = normalizePhoneDigits(params.requestedCode);
  const customerDigits = normalizePhoneDigits(params.customerPhone);
  if (requestedDigits.length < 10 || customerDigits.length < 10) return null;
  if (requestedDigits.slice(-10) !== customerDigits.slice(-10)) return null;

  const { data: override, error: overrideError } = await params.db
    .from("phone_coupon_overrides")
    .select("id,disabled,custom_discount_type,custom_discount_value,custom_min_order_amount,custom_description")
    .eq("workspace_id", params.workspaceId)
    .eq("customer_id", params.customerId)
    .maybeSingle();
  if (overrideError) throw overrideError;
  if (override?.disabled === true) {
    throw new ApiError(409, "This phone coupon is disabled.", "phone_coupon_disabled");
  }

  const type = text(override?.custom_discount_type)
    || text(params.operationalSettings.phone_coupon_discount_type)
    || "percentage";
  const value = override?.custom_discount_value !== null && override?.custom_discount_value !== undefined
    ? finiteNonNegative("phone_coupon.custom_discount_value", override.custom_discount_value)
    : finiteNonNegative("phone_coupon.discount_value", params.operationalSettings.phone_coupon_discount_value);
  const minOrder = override?.custom_min_order_amount !== null && override?.custom_min_order_amount !== undefined
    ? finiteNonNegative("phone_coupon.custom_min_order_amount", override.custom_min_order_amount)
    : finiteNonNegative("phone_coupon.min_order_amount", params.operationalSettings.phone_coupon_min_order_amount);

  if (params.subtotal < minOrder) {
    throw new ApiError(409, "The booking does not meet this phone coupon's minimum order.", "coupon_minimum_not_met");
  }

  return {
    kind: "phone_coupon",
    sourceId: `customer:${params.customerId}`,
    // Never persist or return the customer's phone digits as coupon evidence.
    code: null,
    discountType: type as "percentage" | "fixed",
    configuredValue: value,
    amountDollars: discountAmount(params.subtotal, type, value),
    description: text(override?.custom_description)
      || text(params.operationalSettings.phone_coupon_description)
      || "Loyalty discount",
    minOrderDollars: minOrder,
    validatedAt: params.now.toISOString(),
  };
}

/**
 * Load the server-authoritative, read-only financial context for a persisted
 * public booking. No payment, invoice, coupon redemption, or appointment state
 * is mutated here.
 */
export async function loadPublicBookingFinancialContext(params: {
  bookingSlug: string;
  appointmentId: string;
  couponCode?: string | null;
  now?: Date;
}): Promise<PublicBookingFinancialContext> {
  const db = createSupabaseAdminClient() as any;
  const now = params.now ?? new Date();
  const bookingSlug = params.bookingSlug.trim();
  if (!bookingSlug) throw new ApiError(400, "Booking slug is required.", "booking_context_invalid");

  const { data: settings, error: settingsError } = await db
    .from("workspace_settings")
    .select("workspace_id,booking_enabled,tax_rate,payment_provider,waste_oil_fee_enabled,waste_oil_fee,shop_fee_enabled,shop_fee_type,shop_fee_value,shop_fee_description,surcharge_enabled,surcharge_type,surcharge_value,surcharge_description,operational_settings")
    .eq("booking_slug", bookingSlug)
    .eq("booking_enabled", true)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings) throw new ApiError(404, "Public booking context not found.", "booking_context_invalid");

  const workspaceId = String(settings.workspace_id);
  const operationalSettings = record(settings.operational_settings);

  const [{ data: workspace, error: workspaceError }, { data: appointment, error: appointmentError }] = await Promise.all([
    db.from("workspaces").select("id,currency_code,is_active").eq("id", workspaceId).maybeSingle(),
    db.from("appointments")
      .select("id,workspace_id,customer_id,vehicle_id,location_id,source,status")
      .eq("id", params.appointmentId)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (workspaceError) throw workspaceError;
  if (appointmentError) throw appointmentError;
  if (!workspace?.is_active || !appointment) {
    throw new ApiError(404, "Booking appointment not found.", "booking_context_invalid");
  }
  if (appointment.source !== "public_booking") {
    throw new ApiError(409, "Appointment is not a public booking.", "booking_context_invalid");
  }
  if (appointment.status === "cancelled" || appointment.status === "no_show") {
    throw new ApiError(409, "Cancelled bookings cannot be financially finalized.", "booking_not_payable");
  }
  if (!appointment.location_id) {
    throw new ApiError(409, "Booking service location is missing.", "booking_location_required");
  }

  const [{ data: location, error: locationError }, { data: customer, error: customerError }, { data: rawItems, error: itemsError }] = await Promise.all([
    db.from("locations")
      .select("id,workspace_id,location_type,address_line1,address_line2,city,region,postal_code,country_code")
      .eq("id", appointment.location_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db.from("customers")
      .select("id,workspace_id,phone")
      .eq("id", appointment.customer_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    db.from("appointment_items")
      .select("quantity,unit_price,description,metadata,service_catalog(name,category)")
      .eq("appointment_id", appointment.id)
      .eq("workspace_id", workspaceId),
  ]);
  if (locationError) throw locationError;
  if (customerError) throw customerError;
  if (itemsError) throw itemsError;
  if (!location || location.location_type !== "customer_site") {
    throw new ApiError(409, "Booking service location is invalid.", "booking_location_invalid");
  }
  if (!customer) throw new ApiError(409, "Booking customer is invalid.", "customer_context_invalid");

  const items = ((rawItems ?? []) as JsonRecord[]).filter((item) => itemIsBillable(item.metadata));
  if (items.length === 0) {
    throw new ApiError(409, "Booking has no billable service items.", "booking_financial_items_missing");
  }

  let subtotal = 0;
  let hasOilService = false;
  for (const item of items) {
    const quantity = finiteNonNegative("appointment_item.quantity", item.quantity);
    const unitPrice = finiteNonNegative("appointment_item.unit_price", item.unit_price);
    subtotal += quantity * unitPrice;
    hasOilService ||= itemLooksLikeOilService(item);
  }
  const itemSubtotalDollars = bankersRound(subtotal, 2);

  let discount: PublicBookingValidatedDiscount | null = null;
  const requestedCoupon = text(params.couponCode);
  if (requestedCoupon) {
    const { data: couponRows, error: couponError } = await db
      .from("coupon_codes")
      .select("id,code,description,discount_type,discount_value,min_order_amount,max_uses,used_count,valid_from,valid_until,is_active")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    if (couponError) throw couponError;

    discount = validateRegularCoupon({
      rows: (couponRows ?? []) as JsonRecord[],
      requestedCode: requestedCoupon,
      subtotal: itemSubtotalDollars,
      now,
    });

    if (!discount) {
      discount = await validatePhoneCoupon({
        db,
        workspaceId,
        customerId: String(customer.id),
        customerPhone: text(customer.phone),
        requestedCode: requestedCoupon,
        subtotal: itemSubtotalDollars,
        operationalSettings,
        now,
      });
    }

    if (!discount) {
      throw new ApiError(409, "Invalid or expired coupon code.", "coupon_invalid");
    }
  }

  const taxProvider: "manual" | "stripe" = operationalSettings.tax_provider === "stripe" ? "stripe" : "manual";
  const locationFields = {
    line1: text(location.address_line1),
    line2: text(location.address_line2),
    city: text(location.city),
    state: text(location.region),
    postalCode: text(location.postal_code),
    country: text(location.country_code).toUpperCase() || "US",
  };
  if (!locationFields.line1) {
    throw new ApiError(409, "Booking service address is missing.", "booking_location_invalid");
  }
  if (taxProvider === "stripe" && (!locationFields.city || !locationFields.state || !locationFields.postalCode)) {
    throw new ApiError(
      409,
      "Structured service location is required for Stripe Tax finalization.",
      "tax_location_incomplete",
    );
  }

  return {
    workspaceId,
    appointmentId: String(appointment.id),
    customerId: String(appointment.customer_id),
    vehicleId: appointment.vehicle_id ? String(appointment.vehicle_id) : null,
    locationId: String(location.id),
    itemSubtotalDollars,
    hasOilService,
    discount,
    feeSettings: {
      waste_oil_fee_enabled: Boolean(settings.waste_oil_fee_enabled),
      waste_oil_fee: finiteNonNegative("workspace.waste_oil_fee", settings.waste_oil_fee),
      shop_fee_enabled: Boolean(settings.shop_fee_enabled),
      shop_fee_type: feeType("workspace.shop_fee_type", settings.shop_fee_type),
      shop_fee_value: finiteNonNegative("workspace.shop_fee_value", settings.shop_fee_value),
      shop_fee_description: text(settings.shop_fee_description),
      surcharge_enabled: Boolean(settings.surcharge_enabled),
      surcharge_type: feeType("workspace.surcharge_type", settings.surcharge_type),
      surcharge_value: finiteNonNegative("workspace.surcharge_value", settings.surcharge_value),
      surcharge_description: text(settings.surcharge_description),
    },
    tax: {
      provider: taxProvider,
      ratePercent: percentage("workspace.tax_rate", settings.tax_rate),
      paymentProvider: text(settings.payment_provider) || null,
      operationalSettings,
      currencyCode: text(workspace.currency_code).toUpperCase() || "USD",
      location: locationFields,
    },
  };
}
