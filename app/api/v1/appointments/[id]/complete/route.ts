import { ApiError, errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { syncCanonicalInvoiceToStripe } from "@/server/payments/stripe-invoice-sync";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function billingAllowsPayments(billing: unknown): boolean {
  const row = object(billing);
  return row.payments_addon_active === true
    && (row.subscription_status === "active" || row.subscription_status === "trialing");
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const { supabase, user, membership } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher", "technician"],
      request,
    );
    const db = supabase as any;

    if (membership.role === "technician") {
      const { data: current, error: currentError } = await db
        .from("appointments")
        .select("assigned_user_id,status")
        .eq("workspace_id", workspace_id)
        .eq("id", id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new ApiError(404, "Appointment not found.", "not_found");
      if (current.assigned_user_id !== user.id) {
        throw new ApiError(403, "This appointment is not assigned to you.", "forbidden");
      }
    }

    const { data: closeout, error } = await db.rpc(
      "complete_appointment_closeout_v1",
      { p_workspace_id: workspace_id, p_appointment_id: id },
    );
    if (error) throw error;

    if (membership.role === "technician") {
      const { error: presenceError } = await db.rpc("set_technician_presence_v1", {
        p_workspace_id: workspace_id,
        p_status: "available",
        p_appointment_id: null,
        p_location: null,
      });
      if (presenceError) throw presenceError;
    }

    const closeoutData = object(closeout);
    const serviceRecordId = String(closeoutData.service_record_id ?? "");
    const invoiceId = String(closeoutData.invoice_id ?? "");
    const paymentId = String(closeoutData.payment_id ?? "");

    let stripeSync: Record<string, unknown> = { status: "skipped", reason: "payments_addon_inactive" };
    let actionUrl = new URL("/my-bookings", request.url).toString();

    const { data: billing, error: billingError } = await db
      .from("workspace_billing")
      .select("payments_addon_active,subscription_status")
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (billingError) throw billingError;

    if (invoiceId && paymentId && billingAllowsPayments(billing)) {
      try {
        const synced = await syncCanonicalInvoiceToStripe({
          supabase,
          workspaceId: workspace_id,
          appointmentId: id,
          invoiceId,
          paymentId,
        });
        stripeSync = synced as unknown as Record<string, unknown>;
        if (synced.hostedInvoiceUrl) actionUrl = synced.hostedInvoiceUrl;
      } catch (stripeError) {
        const message = stripeError instanceof Error ? stripeError.message : "Stripe synchronization failed";
        stripeSync = { status: "failed", provider: "stripe", error: message };
        console.error("[Closeout] Stripe invoice sync failed", { appointmentId: id, invoiceId, paymentId, message });

        const [{ data: invoice }, { data: payment }] = await Promise.all([
          db.from("invoices").select("metadata").eq("workspace_id", workspace_id).eq("id", invoiceId).maybeSingle(),
          db.from("payments").select("metadata").eq("workspace_id", workspace_id).eq("id", paymentId).maybeSingle(),
        ]);
        const failedAt = new Date().toISOString();
        await Promise.all([
          db.from("invoices").update({
            metadata: {
              ...object(invoice?.metadata),
              stripe_sync_status: "failed",
              stripe_sync_error: message,
              stripe_sync_failed_at: failedAt,
            },
          }).eq("workspace_id", workspace_id).eq("id", invoiceId),
          db.from("payments").update({
            metadata: {
              ...object(payment?.metadata),
              stripe_sync_status: "failed",
              stripe_sync_error: message,
              stripe_sync_failed_at: failedAt,
            },
          }).eq("workspace_id", workspace_id).eq("id", paymentId),
        ]);
      }
    }

    let completionEmail: Record<string, unknown> = { status: "skipped" };
    try {
      const [{ data: appointment }, { data: workspace }] = await Promise.all([
        db
          .from("appointments")
          .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
          .eq("workspace_id", workspace_id)
          .eq("id", id)
          .single(),
        db.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
      ]);
      if (appointment) {
        const queued = await dispatchAppointmentLifecycle({
          eventKey: LIFECYCLE_EVENT_KEYS.serviceCompleted,
          eventId: `${id}:completed:${serviceRecordId}`,
          appointment,
          workspaceName: workspace?.name ?? "Service Writer",
          workspaceTimezone: workspace?.timezone ?? "UTC",
          actionUrl,
        });
        completionEmail = queued
          ? { status: "queued", action_url: actionUrl }
          : { status: "skipped", reason: "customer_email_missing" };
      }
    } catch (dispatchError) {
      const message = dispatchError instanceof Error ? dispatchError.message : "Completion email enqueue failed";
      completionEmail = { status: "failed", error: message };
      console.error("[Lifecycle] service-completed email enqueue failed", dispatchError);
    }

    return json({
      data: {
        ...closeoutData,
        stripe_sync: stripeSync,
        completion_email: completionEmail,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
