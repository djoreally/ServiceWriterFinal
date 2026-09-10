import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { dispatchAppointmentLifecycle } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { z } from "zod";

const bodySchema = z.object({ workspace_id: z.string().uuid() });

/** Explicit staff-triggered customer confirmation email. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const appointmentId = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = bodySchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(
      workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"],
      request,
    );

    const [{ data: appointment, error }, { data: workspace }, { data: items, error: itemsError }, { data: invoices, error: invoiceError }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id,workspace_id,customer_id,starts_at,ends_at,status,notes,metadata,updated_at,customers(id,first_name,last_name,email),vehicles(id,year,make,model)")
        .eq("workspace_id", workspace_id)
        .eq("id", appointmentId)
        .single(),
      supabase.from("workspaces").select("name,timezone").eq("id", workspace_id).single(),
      supabase
        .from("appointment_items")
        .select("description,quantity,unit_price,sort_order,created_at")
        .eq("workspace_id", workspace_id)
        .eq("appointment_id", appointmentId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("invoices")
        .select("id,invoice_number,total,status,amount_paid")
        .eq("workspace_id", workspace_id)
        .contains("metadata", { appointment_id: appointmentId })
        .limit(1),
    ]);
    if (error || !appointment) throw error ?? new Error("Appointment not found.");
    if (itemsError) throw itemsError;
    if (invoiceError) throw invoiceError;

    const invoice = invoices?.[0];
    const serviceSummary = (items ?? [])
      .map((item) => {
        const quantity = Math.max(1, Number(item.quantity) || 1);
        const price = Number(item.unit_price) || 0;
        const lineTotal = (price * quantity).toLocaleString("en-US", { style: "currency", currency: "USD" });
        return `${item.description}${quantity > 1 ? ` × ${quantity}` : ""} — ${lineTotal}`;
      })
      .join("; ");

    const existingMetadata = appointment.metadata && typeof appointment.metadata === "object" && !Array.isArray(appointment.metadata)
      ? appointment.metadata as Record<string, unknown>
      : {};
    const enrichedAppointment = {
      ...appointment,
      metadata: {
        ...existingMetadata,
        ...(serviceSummary ? { title: serviceSummary } : {}),
        ...(invoice ? {
          estimated_cost: Number(invoice.total),
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_status: invoice.status,
          amount_paid: Number(invoice.amount_paid),
        } : {}),
      },
    };

    const result = await dispatchAppointmentLifecycle({
      eventKey: LIFECYCLE_EVENT_KEYS.bookingCreated,
      eventId: `${appointmentId}:staff-confirmation:${appointment.updated_at ?? appointment.starts_at}`,
      appointment: enrichedAppointment,
      workspaceName: workspace?.name ?? "Service Writer",
      workspaceTimezone: workspace?.timezone ?? "UTC",
      actionUrl: new URL("/my-bookings", request.url).toString(),
    });

    if (!result) return json({ error: { code: "missing_recipient", message: "The appointment has no customer email address." } }, { status: 422 });
    return json({ data: { status: result.status, invoice_id: invoice?.id ?? null, invoice_number: invoice?.invoice_number ?? null } });
  } catch (error) {
    return errorResponse(error);
  }
}
