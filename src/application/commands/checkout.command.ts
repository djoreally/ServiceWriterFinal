/**
 * Checkout Command - Application Layer
 * 
 * ENTERPRISE REQUIREMENT:
 * - UI components MUST NOT directly invoke Stripe or payment logic
 * - All checkout operations go through this application command
 * - Never assume payment success - always verify via webhooks/verification
 * - Supports multiple payment providers (Stripe + Square)
 */

import { supabase } from "@/integrations/supabase/client";
import type { AppointmentBookingConfiguration } from "@/lib/booking-configuration";

export type PaymentProviderType = "stripe" | "square";

export interface CheckoutRequest {
  // Tenant context (required - fail closed)
  tenantId: string;

  // Payment provider to use
  paymentProvider: PaymentProviderType;
  
  // Service selection
  serviceCatalogIds: string[];
  
  // Customer information
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  
  // Oil quart adjustment (in dollars, server will convert to cents)
  // Covers extra quarts beyond the base 5 included in oil change services
  oilPriceAdjustment?: number;
  /** Number of extra whole quarts (used to itemize the line item N qt × $price). */
  oilExtraQuarts?: number;
  /** Per-quart price in DOLLARS. */
  oilPricePerQuart?: number;
  
  // Appointment data
  appointmentData: {
    scheduledDate: string;
    scheduledTime: string;
    dropOffOption: "drop-off" | "wait" | "pickup";
    customerAddress?: string;
    vehicles?: Array<{
      year?: string;
      make?: string;
      model?: string;
      licensePlate?: string;
      vin?: string;
      mileage?: string;
    }>;
    bookingConfiguration?: AppointmentBookingConfiguration;
    vehicleServiceAssignments?: Record<string, { serviceCatalogIds: string[]; packageId?: string | null }>;
    tireItems?: Array<{ inventoryItemId:string; quantity:number }>;
    notes?: string;
    consent?: {
      transactionalSmsConsent: boolean;
      marketingSmsConsent: boolean;
      marketingEmailConsent: boolean;
      consentTexts: {
        transactionalSms: string;
        marketingSms: string;
        marketingEmail: string;
      };
    };
  };
  
  /** Attribution source (e.g. "provider_directory") — marketplace bookings are platform-fee free. */
  bookingSource?: string;

  // URLs for redirect
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  success: boolean;
  redirectUrl?: string;
  sessionId?: string;
  error?: CheckoutError;
}

export interface CheckoutError {
  type: 'tenant_not_found' | 'payment_provider_not_enabled' | 'validation_error' | 'rate_limited' | 'network_error' | 'unknown';
  message: string;
  retryAfter?: number;
}

/**
 * Start checkout process
 * 
 * This is the ONLY entry point for initiating payments from UI
 * 
 * @param request - Checkout request with all required data
 * @returns CheckoutResult with redirect URL or error
 */
export async function startCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
  // Validate tenant context - fail closed
  if (!request.tenantId) {
    return {
      success: false,
      error: {
        type: 'tenant_not_found',
        message: 'Booking session invalid. Please refresh and try again.',
      },
    };
  }

  // Validate required fields
  if (!request.serviceCatalogIds || request.serviceCatalogIds.length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'Please select at least one service.',
      },
    };
  }

  if (!request.customerEmail) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'Email address is required.',
      },
    };
  }

  // Generate idempotency key to prevent duplicate checkouts
  const idempotencyKey = `booking_${request.tenantId}_${request.customerEmail}_${Date.now()}`;

  // Route to the correct edge function based on provider
  const edgeFunctionName = request.paymentProvider === "square"
    ? "create-square-payment"
    : "create-booking-payment";

  try {
    const { data, error } = await supabase.functions.invoke(edgeFunctionName, {
      body: {
        business_user_id: request.tenantId,
        service_catalog_ids: request.serviceCatalogIds,
        customer_email: request.customerEmail,
        customer_name: request.customerName,
        idempotency_key: idempotencyKey,
        // Oil quart adjustment for vehicles needing more than base 5 quarts (in dollars)
        oil_price_adjustment: request.oilPriceAdjustment || 0,
        oil_extra_quarts: request.oilExtraQuarts || 0,
        oil_price_per_quart: request.oilPricePerQuart || 0,
        appointment_data: {
          scheduledDate: request.appointmentData.scheduledDate,
          scheduledTime: request.appointmentData.scheduledTime,
          dropOffOption: request.appointmentData.dropOffOption,
          customerAddress: request.appointmentData.customerAddress,
          customerPhone: request.customerPhone || undefined,
          vehicles: request.appointmentData.vehicles,
          bookingConfiguration: request.appointmentData.bookingConfiguration,
          vehicleServiceAssignments: request.appointmentData.vehicleServiceAssignments,
          tireItems: request.appointmentData.tireItems,
          notes: request.appointmentData.notes,
          consent: request.appointmentData.consent,
          hasPickupService: request.appointmentData.dropOffOption === "pickup",
        },
        booking_source: request.bookingSource || undefined,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      },
    });

    if (error) {
      // supabase.functions.invoke wraps non-2xx responses in FunctionsHttpError
      // The actual error body from the edge function is in error.context (JSON)
      const ctx = (error as any)?.context;
      let edgeMessage: string | undefined;
      if (ctx && typeof ctx === "object") {
        // ctx is the parsed JSON body from the edge function response
        edgeMessage = ctx.error ?? ctx.message ?? undefined;
      }
      if (!edgeMessage && typeof error === "object" && error !== null) {
        edgeMessage = (error as any).message;
      }
      return parseCheckoutError(new Error(edgeMessage || "Payment service error. Please try again."));
    }

    if (data?.url) {
      return {
        success: true,
        redirectUrl: data.url,
        sessionId: data.session_id,
      };
    }

    return {
      success: false,
      error: {
        type: 'unknown',
        message: 'No checkout URL received. Please try again.',
      },
    };
  } catch (err) {
    return parseCheckoutError(err);
  }
}

/**
 * Parse error from checkout attempt
 */
function parseCheckoutError(error: unknown): CheckoutResult {
  // Safely extract message from any error shape (Error, PostgrestError, FunctionsHttpError, plain object)
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? (error as Record<string, unknown>).message as string
          ?? (error as Record<string, unknown>).error_description as string
          ?? JSON.stringify(error)
        : String(error);
  const lowerMessage = (message ?? "").toLowerCase();

  // Rate limiting — give actionable fallback messaging
  if (
    lowerMessage.includes('rate_limit') ||
    lowerMessage.includes('too many') ||
    lowerMessage.includes('429')
  ) {
    const retryMatch = message.match(/retry_after[:\s]*(\d+)/i);
    return {
      success: false,
      error: {
        type: 'rate_limited',
        message:
          'We\'re seeing a lot of booking activity right now. Please wait a moment and try again — or choose "Pay at Time of Service" to book without online payment.',
        retryAfter: retryMatch ? parseInt(retryMatch[1], 10) : 30,
      },
    };
  }

  // Bot/spam filter false positive
  if (lowerMessage.includes('bot_filtered')) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'Your booking was blocked by our spam filter. Please refresh the page and try again, or contact the shop directly.',
      },
    };
  }

  // Provider not enabled (Stripe or Square)
  if (
    (lowerMessage.includes('stripe') || lowerMessage.includes('square')) &&
    (lowerMessage.includes('not connected') || lowerMessage.includes('not enabled') || lowerMessage.includes('not configured'))
  ) {
    return {
      success: false,
      error: {
        type: 'payment_provider_not_enabled',
        message: 'Online payments are not available for this business right now. Please choose "Pay at Time of Service" to complete your booking.',
      },
    };
  }

  // Tenant / business context missing
  if (lowerMessage.includes('tenant_required') || lowerMessage.includes('invalid_tenant') || lowerMessage.includes('tenant_not_found')) {
    return {
      success: false,
      error: {
        type: 'tenant_not_found',
        message: 'Your booking session expired. Please refresh the page and try again.',
      },
    };
  }

  // Duplicate checkout
  if (lowerMessage.includes('duplicate_checkout')) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'A checkout is already in progress. Please complete or cancel your existing checkout before starting a new one.',
      },
    };
  }

  // Slot conflict surfaced from RPC
  if (lowerMessage.includes('weather_blocked') || lowerMessage.includes('weather_unverified') || lowerMessage.includes('date_blocked')) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: lowerMessage.includes('weather_unverified')
          ? 'Weather Guard could not verify that appointment time. Please refresh the booking page and choose a different slot.'
          : 'That appointment time is unavailable due to Weather Guard. Please choose a different date or time.',
      },
    };
  }

  // Slot conflict surfaced from RPC
  if (lowerMessage.includes('slot_unavailable') || lowerMessage.includes('slot was just booked')) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'That time slot was just booked. Please pick another time.',
      },
    };
  }

  // Validation
  if (lowerMessage.includes('invalid_request') || lowerMessage.includes('missing required') || lowerMessage.includes('invalid email')) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        message: 'Some booking details are missing or invalid. Please review the form and try again.',
      },
    };
  }

  // Network error
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('failed to send')) {
    return {
      success: false,
      error: {
        type: 'network_error',
        message: 'We couldn\'t reach the booking service. Check your connection and try again — or choose "Pay at Time of Service" to complete your booking offline.',
      },
    };
  }

  // Unknown error — never surface raw JSON / stack to customers
  const safeFallback =
    message && message.length < 140 && !message.startsWith('{')
      ? message
      : 'Something went wrong while booking. Please try again, or choose "Pay at Time of Service" if the problem continues.';
  return {
    success: false,
    error: {
      type: 'unknown',
      message: safeFallback,
    },
  };
}
