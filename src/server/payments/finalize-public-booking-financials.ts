import { ApiError } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  calculatePublicBookingFinancials,
  type PublicBookingFinancialSnapshot,
  type PublicBookingPaymentMode,
  type PublicBookingTaxInput,
} from "@/domain/financials/public-booking-financials";
import {
  loadPublicBookingFinancialContext,
  type PublicBookingFinancialContext,
} from "@/server/payments/public-booking-financial-context";
import { resolveStripeWorkspaceExecution } from "@/server/payments/stripe-workspace-execution";

export interface FinalizePublicBookingFinancialsParams {
  bookingSlug: string;
  appointmentId: string;
  paymentId: string;
  businessUserId: string;
  customerEmail: string;
  paymentChoice: "pay_later" | "pay_now";
  couponCode?: string | null;
  rewardInstanceId?: string | null;
}

export interface FinalizedPublicBookingFinancials {
  snapshot: PublicBookingFinancialSnapshot;
  context: PublicBookingFinancialContext;
  idempotent: boolean;
  paymentStatus: "pending" | "succeeded";
  rewardDiscountCents: number;
}

type RpcResult = Record<string, unknown>;

function paymentMode(choice: FinalizePublicBookingFinancialsParams["paymentChoice"]): PublicBookingPaymentMode {
  return choice === "pay_now" ? "online_card" : "pay_at_service";
}

function locationTaxEnabled(context: PublicBookingFinancialContext): boolean {
  return context.tax.operationalSettings.location_tax_enabled !== false;
}

function statusOf(value: unknown): string {
  return value && typeof value === "object" && !Array.isArray(value)
    ? String((value as RpcResult).status ?? "")
    : "";
}

async function calculateStripeTax(params: {
  context: PublicBookingFinancialContext;
  taxableBaseCents: number;
  appointmentId: string;
}): Promise<PublicBookingTaxInput> {
  if (params.context.tax.paymentProvider !== "stripe") {
    throw new ApiError(409, "Stripe Tax is selected but Stripe is not the workspace payment provider.", "tax_configuration_invalid");
  }

  const location = params.context.tax.location;
  if (!location.line1 || !location.city || !location.state || !location.postalCode) {
    throw new ApiError(409, "Structured service location is required for Stripe Tax finalization.", "tax_location_incomplete");
  }

  const execution = resolveStripeWorkspaceExecution(params.context.tax.operationalSettings);
  const calculation = await execution.stripe.tax.calculations.create({
    currency: params.context.tax.currencyCode.toLowerCase(),
    customer_details: {
      address: {
        line1: location.line1,
        line2: location.line2 || undefined,
        city: location.city,
        state: location.state,
        postal_code: location.postalCode,
        country: location.country,
      },
      address_source: "billing",
    },
    line_items: [{
      amount: params.taxableBaseCents,
      reference: `appointment:${params.appointmentId}`,
      tax_behavior: "exclusive",
      tax_code: "txcd_10103001",
    }],
  }, execution.requestOptions(`public-booking-tax:${params.appointmentId}:${params.taxableBaseCents}`));

  const result = calculation as unknown as { id: string; tax_amount_exclusive?: number | null };
  const amountCents = Number(result.tax_amount_exclusive ?? 0);
  if (!Number.isInteger(amountCents) || amountCents < 0) {
    throw new ApiError(502, "Stripe Tax returned an invalid amount.", "tax_calculation_invalid");
  }

  return { amountCents, source: `stripe_tax_${execution.mode}`, calculationId: result.id };
}

async function prepareReward(params: {
  admin: any;
  rewardInstanceId: string;
  appointmentId: string;
  paymentId: string;
  businessUserId: string;
  customerEmail: string;
  itemSubtotalCents: number;
}): Promise<number> {
  const { data: reserved, error: reserveError } = await params.admin.rpc("reserve_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId,
    p_provider_id: params.businessUserId,
    p_customer_email: params.customerEmail,
    p_idempotency_key: `booking:${params.appointmentId}:reward:${params.rewardInstanceId}:reserve`,
    p_reservation_minutes: 30,
  });
  if (reserveError) throw reserveError;
  if (statusOf(reserved) !== "reserved") {
    throw new ApiError(409, "The selected reward is no longer available.", "reward_not_available");
  }

  const { data: applied, error: applyError } = await params.admin.rpc("apply_booking_reward", {
    p_reward_instance_id: params.rewardInstanceId,
    p_appointment_id: params.appointmentId,
    p_payment_record_id: params.paymentId,
    p_subtotal_cents: params.itemSubtotalCents,
    p_tax_cents: 0,
    p_idempotency_key: `booking:${params.appointmentId}:reward:${params.rewardInstanceId}:apply`,
  });
  if (applyError) throw applyError;
  if (statusOf(applied) !== "applied") {
    throw new ApiError(409, "The selected reward requires manual review and was not applied.", "reward_not_applicable");
  }

  const discountCents = Number((applied as RpcResult | null)?.discount_cents ?? 0);
  if (!Number.isInteger(discountCents) || discountCents < 0) {
    throw new ApiError(500, "Reward returned an invalid discount.", "reward_discount_invalid");
  }
  return Math.min(discountCents, params.itemSubtotalCents);
}

async function financialState(admin: any, workspaceId: string, paymentId: string): Promise<string> {
  const { data, error } = await admin
    .from("payments")
    .select("metadata")
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();
  if (error) throw error;
  const metadata = data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
    ? data.metadata as Record<string, unknown>
    : {};
  return String(metadata.financial_state ?? "");
}

export async function finalizePublicBookingFinancials(
  params: FinalizePublicBookingFinancialsParams,
): Promise<FinalizedPublicBookingFinancials> {
  const context = await loadPublicBookingFinancialContext({
    bookingSlug: params.bookingSlug,
    appointmentId: params.appointmentId,
    couponCode: params.couponCode,
  });

  const admin = createSupabaseAdminClient() as any;
  const itemSubtotalCents = Math.round(context.itemSubtotalDollars * 100);
  let rewardDiscountCents = 0;
  let rewardPrepared = false;

  try {
    if (params.rewardInstanceId) {
      rewardDiscountCents = await prepareReward({
        admin,
        rewardInstanceId: params.rewardInstanceId,
        appointmentId: params.appointmentId,
        paymentId: params.paymentId,
        businessUserId: params.businessUserId,
        customerEmail: params.customerEmail,
        itemSubtotalCents,
      });
      rewardPrepared = true;
    }

    const mode = paymentMode(params.paymentChoice);
    const discountDollars = (context.discount?.amountDollars ?? 0) + rewardDiscountCents / 100;

    const preTax = calculatePublicBookingFinancials({
      itemSubtotalDollars: context.itemSubtotalDollars,
      discountDollars,
      hasOilService: context.hasOilService,
      feeSettings: context.feeSettings,
      paymentMode: mode,
      tax: { ratePercent: 0, source: "pre_tax_basis" },
    });

    let tax: PublicBookingTaxInput;
    if (!locationTaxEnabled(context)) {
      tax = { amountCents: 0, source: "tax_disabled" };
    } else if (context.tax.provider === "stripe") {
      tax = await calculateStripeTax({ context, taxableBaseCents: preTax.taxableBaseCents, appointmentId: params.appointmentId });
    } else {
      tax = { ratePercent: context.tax.ratePercent, source: "workspace_manual_rate" };
    }

    const snapshot = calculatePublicBookingFinancials({
      itemSubtotalDollars: context.itemSubtotalDollars,
      discountDollars,
      hasOilService: context.hasOilService,
      feeSettings: context.feeSettings,
      paymentMode: mode,
      tax,
    });

    const discountEvidence = context.discount || params.rewardInstanceId
      ? {
          coupon: context.discount ?? null,
          reward: params.rewardInstanceId
            ? { rewardInstanceId: params.rewardInstanceId, discountCents: rewardDiscountCents }
            : null,
        }
      : null;

    const finalizeArgs = {
      p_booking_slug: params.bookingSlug,
      p_appointment_id: params.appointmentId,
      p_payment_id: params.paymentId,
      p_snapshot: snapshot,
      p_discount: discountEvidence,
      p_reward_instance_id: params.rewardInstanceId ?? null,
      p_reward_discount_cents: rewardDiscountCents,
    };

    let data: unknown;
    let error: unknown;
    ({ data, error } = await admin.rpc("finalize_public_booking_financials_v1", finalizeArgs));

    if (error) {
      // The HTTP response could be lost after PostgreSQL committed. Read back
      // state before attempting any reward rollback; canonical means success.
      if (await financialState(admin, context.workspaceId, params.paymentId) !== "canonical") {
        throw error;
      }
      const { data: payment } = await admin
        .from("payments")
        .select("status")
        .eq("workspace_id", context.workspaceId)
        .eq("id", params.paymentId)
        .single();
      return {
        snapshot,
        context,
        idempotent: true,
        paymentStatus: payment?.status === "succeeded" ? "succeeded" : "pending",
        rewardDiscountCents,
      };
    }

    const response = data as { idempotent?: unknown; payment_status?: unknown } | null;
    return {
      snapshot,
      context,
      idempotent: Boolean(response?.idempotent),
      paymentStatus: response?.payment_status === "succeeded" ? "succeeded" : "pending",
      rewardDiscountCents,
    };
  } catch (error) {
    if (rewardPrepared && params.rewardInstanceId) {
      try {
        if (await financialState(admin, context.workspaceId, params.paymentId) !== "canonical") {
          await admin.rpc("cancel_booking_reward", {
            p_reward_instance_id: params.rewardInstanceId,
            p_appointment_id: params.appointmentId,
            p_reason: "booking_financial_finalization_failed",
          });
        }
      } catch (rollbackError) {
        console.error("[public-booking] reward rollback check failed", {
          appointmentId: params.appointmentId,
          rewardInstanceId: params.rewardInstanceId,
          rollbackError,
        });
      }
    }
    throw error;
  }
}
