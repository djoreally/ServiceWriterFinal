import { ApiError } from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  resolveStripeWorkspaceExecution,
  type StripeWorkspaceExecution,
} from "@/server/payments/stripe-workspace-execution";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface PublicBookingWorkspace {
  id: string;
  name: string;
  timezone: string | null;
  currencyCode: string;
}

export interface GuestAppointment {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function unavailable(): ApiError {
  return new ApiError(404, "Booking provider unavailable", "booking_unavailable");
}

/**
 * Resolve the workspace a public booking slug points at. Mirrors the
 * confirmation route: workspace_settings.booking_slug with booking_enabled,
 * then an active workspace. The slug is the canonical one (the same slug
 * booking creation is bound to); aliases are a read-route concern.
 */
export async function resolvePublicBookingWorkspace(
  admin: AdminClient,
  slug: string,
): Promise<PublicBookingWorkspace> {
  const settingsResult = await admin
    .from("workspace_settings")
    .select("workspace_id")
    .eq("booking_slug", slug)
    .eq("booking_enabled", true)
    .limit(1)
    .single();
  if (settingsResult.error || !settingsResult.data?.workspace_id) throw unavailable();

  const workspaceResult = await admin
    .from("workspaces")
    .select("id,name,timezone,currency_code")
    .eq("id", settingsResult.data.workspace_id)
    .eq("is_active", true)
    .single();
  if (workspaceResult.error || !workspaceResult.data) throw unavailable();

  return {
    id: workspaceResult.data.id as string,
    name: workspaceResult.data.name as string,
    timezone: (workspaceResult.data.timezone as string | null) ?? null,
    currencyCode: (workspaceResult.data.currency_code as string | null) || "USD",
  };
}

/**
 * Load an appointment inside a workspace and bind it to the guest by the
 * email stored on the appointment at booking time — the same binding the
 * confirmation route uses, so a payment can only ever target the caller's
 * own booking.
 */
export async function loadGuestAppointment(
  admin: AdminClient,
  workspaceId: string,
  appointmentId: string,
  email: string,
): Promise<GuestAppointment> {
  const result = await admin
    .from("appointments")
    .select("id,workspace_id,customer_id,status,metadata")
    .eq("id", appointmentId)
    .eq("workspace_id", workspaceId)
    .single();
  const appointment = result.data as GuestAppointment | null;
  const boundEmail = String(object(appointment?.metadata).guest_email || "").toLowerCase();
  if (result.error || !appointment || boundEmail !== email.toLowerCase()) {
    throw new ApiError(404, "Booking not found", "payment_booking_not_found");
  }
  return appointment;
}

/**
 * The Payments add-on gate from requireWorkspacePaymentsAddon, minus the
 * member session: a public caller can only pay a workspace whose billing
 * has the add-on active on a live subscription.
 */
export async function assertWorkspacePaymentsEnabled(
  admin: AdminClient,
  workspaceId: string,
): Promise<void> {
  const { data: billing, error } = await admin
    .from("workspace_billing")
    .select("payments_addon_active,subscription_status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw error;
  const subscriptionActive =
    billing?.subscription_status === "active" || billing?.subscription_status === "trialing";
  if (!billing?.payments_addon_active || !subscriptionActive) {
    throw new ApiError(
      402,
      "The Payments add-on is required for this workspace",
      "payments_addon_required",
    );
  }
}

/**
 * Build the Stripe execution (Connect or direct) for a workspace from its
 * stored operational settings.
 */
export async function loadWorkspaceStripeExecution(
  admin: AdminClient,
  workspaceId: string,
): Promise<StripeWorkspaceExecution> {
  const { data, error } = await admin
    .from("workspace_settings")
    .select("operational_settings")
    .eq("workspace_id", workspaceId)
    .single();
  if (error || !data) throw unavailable();
  return resolveStripeWorkspaceExecution(data.operational_settings);
}

export interface AppointmentInvoice {
  id: string;
  invoice_number: string | null;
  status: string;
  total: number;
  amount_paid: number;
}

/** The appointment's latest invoice, resolved the way the financials route does. */
export async function findAppointmentInvoice(
  admin: AdminClient,
  workspaceId: string,
  appointmentId: string,
): Promise<AppointmentInvoice | null> {
  const { data, error } = await admin
    .from("invoices")
    .select("id,invoice_number,status,total,amount_paid")
    .eq("workspace_id", workspaceId)
    .contains("metadata", { appointment_id: appointmentId })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const invoice = data?.[0];
  if (!invoice) return null;
  return {
    id: invoice.id as string,
    invoice_number: (invoice.invoice_number as string | null) ?? null,
    status: invoice.status as string,
    total: Number(invoice.total ?? 0),
    amount_paid: Number(invoice.amount_paid ?? 0),
  };
}

export function invoiceBalanceDue(invoice: AppointmentInvoice): number {
  return Math.max(0, Number((invoice.total - invoice.amount_paid).toFixed(2)));
}
