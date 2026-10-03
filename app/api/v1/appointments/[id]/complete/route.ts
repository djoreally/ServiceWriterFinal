import { errorResponse, json } from "@/server/api";
import { ApiAppointment, legacyAppointment, loadAppointmentRelations, loadWorkspace } from "@/server/cutover/appointments";
import { sendCanonicalLifecycleEmail } from "@/server/cutover/communications";
import { appointmentCustomerEmail, appointmentLifecycleVariables, type AppointmentLifecycleRecord } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

async function advanceToCompleted(request: Request, workspaceId: string, id: string, current: ApiAppointment, key: string) {
  const transition = (status: string, suffix: string) => serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspaceId}/appointments/${id}/transition`, { method: "POST", headers: { "idempotency-key": `${key}:${suffix}` }, body: JSON.stringify({ status }) });
  let row = current;
  if (row.status === "scheduled") row = await transition("confirmed", "confirm");
  if (row.status === "confirmed") row = await transition("in_progress", "start");
  if (row.status === "in_progress") row = await transition("completed", "complete");
  if (row.status !== "completed") throw new Error(`Appointment cannot be completed from status ${row.status}`);
  return row;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    const workspace = await loadWorkspace(request, workspace_id);
    const timezone = workspace.timezone || "UTC";
    const current = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspace_id}/appointments/${id}`);
    if (["cancelled", "no_show"].includes(current.status)) return json({ error: { code: "invalid_status", message: "This appointment cannot be completed." } }, { status: 409 });
    const completed = current.status === "completed" ? current : await advanceToCompleted(request, workspace_id, id, current, ensureIdempotencyKey(request));
    const { customers, vehicles } = await loadAppointmentRelations(request, workspace_id, [completed]);
    const legacy = legacyAppointment(completed, timezone, customers.get(completed.customerId), vehicles.get(completed.vehicleId)) as unknown as AppointmentLifecycleRecord;
    let completionEmail: Record<string, unknown> = { status: "skipped", reason: "customer_email_missing" };
    const recipientEmail = appointmentCustomerEmail(legacy);
    if (recipientEmail) {
      try {
        const actionUrl = new URL("/my-bookings", request.url).toString();
        await sendCanonicalLifecycleEmail(request, {
          workspaceId: workspace_id,
          customerId: completed.customerId,
          appointmentId: id,
          recipientEmail,
          templateKey: LIFECYCLE_EVENT_KEYS.serviceCompleted,
          eventId: `${id}:completed:${String(completed.updatedAt ?? Date.now())}`,
          variables: appointmentLifecycleVariables({ appointment: legacy, workspaceName: workspace.name || "Service Writer", workspaceTimezone: timezone, actionUrl }),
          metadata: { cutoverSource: "ServiceWriterFinal", legacyCloseoutBundleRetired: true },
        });
        completionEmail = { status: "queued", action_url: actionUrl };
      } catch (emailError) {
        completionEmail = { status: "failed", error: emailError instanceof Error ? emailError.message : "Completion email failed" };
      }
    }
    return json({ data: {
      appointment_id: id,
      status: "completed",
      service_record_id: null,
      invoice_id: null,
      payment_id: null,
      closeout_mode: "canonical_separate_domains",
      legacy_closeout_bundle_retired: true,
      completion_email: completionEmail,
      completion_summary: { status: "deferred", reason: "Stage 22 canonical closeout separates work order, invoice, payment, and communication workflows" },
      support_follow_up: { status: "deferred" },
      stripe_sync: { status: "deferred", reason: "Stripe settlement is owned by Stage 14/19 payment reconciliation" },
    } });
  } catch (error) {
    return errorResponse(error);
  }
}
