import { errorResponse, json } from "@/server/api";
import {
  ApiAppointment,
  isoToWorkspaceSchedule,
  legacyAppointment,
  loadAppointmentRelations,
  loadWorkspace,
  scheduleToIso,
} from "@/server/cutover/appointments";
import { sendCanonicalLifecycleEmail } from "@/server/cutover/communications";
import { appointmentCustomerEmail, appointmentLifecycleVariables, type AppointmentLifecycleRecord } from "@/server/messaging/appointment-events";
import { LIFECYCLE_EVENT_KEYS } from "@/server/messaging/lifecycle-events";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";
import { z } from "zod";
import { createHonoApp } from "@/server/hono/app";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime().optional(),
  ends_at: z.string().datetime().optional(),
  scheduled_date: z.string().date().optional(),
  scheduled_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  duration_minutes: z.number().int().min(5).max(1440).optional(),
  status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  source: z.string().trim().max(40).optional(),
  notes: z.string().max(5000).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  guest_name: z.string().max(200).nullable().optional(),
  guest_email: z.string().email().max(320).nullable().optional(),
  guest_phone: z.string().max(40).nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  customer_city: z.string().max(120).nullable().optional(),
  customer_state: z.string().max(120).nullable().optional(),
  customer_postal_code: z.string().max(24).nullable().optional(),
  override_availability: z.boolean().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one appointment field is required" });

const compatibilityKeys = ["title","description","guest_name","guest_email","guest_phone","service_catalog_id","estimated_cost","tax_amount","location_address","customer_city","customer_state","customer_postal_code"] as const;
function pad(value: number) { return String(value).padStart(2, "0"); }
function hasOwn(value: object, key: string) { return Object.prototype.hasOwnProperty.call(value, key); }

async function finalLegacy(request: Request, workspaceId: string, id: string, timezone: string) {
  const row = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspaceId}/appointments/${id}`);
  const { customers, vehicles } = await loadAppointmentRelations(request, workspaceId, [row]);
  return legacyAppointment(row, timezone, customers.get(row.customerId), vehicles.get(row.vehicleId));
}

async function transitionStatus(request: Request, workspaceId: string, appointmentId: string, current: string, target: string, key: string) {
  if (target === current) return;
  const post = (path: string, body: unknown, suffix: string) => serviceWriterApi<ApiAppointment>(request, path, {
    method: "POST",
    headers: { "idempotency-key": `${key}:${suffix}` },
    body: JSON.stringify(body),
  });
  if (target === "cancelled") {
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/cancel`, { reason: "Cancelled from ServiceWriterFinal" }, "cancel");
    return;
  }
  const order = ["scheduled", "confirmed", "in_progress", "completed"];
  if (target === "no_show") {
    if (current === "scheduled") await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "confirmed" }, "confirm");
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "no_show" }, "no-show");
    return;
  }
  const from = order.indexOf(current);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || to < from) throw new Error(`Canonical appointment state cannot move from ${current} to ${target}`);
  for (let index = from + 1; index <= to; index += 1) {
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: order[index] }, `transition-${order[index]}`);
  }
}

async function notifyLifecycle(request: Request, input: {
  eventKey: string;
  eventId: string;
  appointment: Record<string, unknown>;
  workspaceName: string;
  timezone: string;
  changedFields?: string[];
}) {
  try {
    const record = input.appointment as unknown as AppointmentLifecycleRecord;
    const recipientEmail = appointmentCustomerEmail(record);
    if (!recipientEmail) return;
    const actionUrl = new URL("/my-bookings", request.url).toString();
    await sendCanonicalLifecycleEmail(request, {
      workspaceId: record.workspace_id,
      customerId: record.customer_id ?? null,
      appointmentId: record.id,
      recipientEmail,
      templateKey: input.eventKey,
      eventId: input.eventId,
      variables: appointmentLifecycleVariables({ appointment: record, workspaceName: input.workspaceName, workspaceTimezone: input.timezone, actionUrl, changedFields: input.changedFields }),
      metadata: { cutoverSource: "ServiceWriterFinal" },
    });
  } catch (error) {
    console.error("[cutover] canonical appointment lifecycle email failed", error);
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const rawId = (await context.params).id;
  const parsedId = z.string().uuid().safeParse(rawId);
  if (!parsedId.success) return createHonoApp().fetch(request);
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const workspace = await loadWorkspace(request, workspaceId);
    return json({ data: await finalLegacy(request, workspaceId, parsedId.data, workspace.timezone || "UTC") });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const workspace = await loadWorkspace(request, body.workspace_id);
    const timezone = workspace.timezone || "UTC";
    const current = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}`);
    const currentLegacy = legacyAppointment(current, timezone) as Record<string, unknown>;
    const baseKey = ensureIdempotencyKey(request);

    const metadata = current.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
    for (const key of compatibilityKeys) if (hasOwn(body, key)) metadata[key] = body[key] ?? null;
    if (hasOwn(body, "location_id")) metadata.location_id = body.location_id ?? null;
    if (hasOwn(body, "assigned_user_id")) metadata.assigned_user_id = body.assigned_user_id ?? null;
    if (hasOwn(body, "source")) metadata.source = body.source ?? null;
    if (hasOwn(body, "override_availability")) metadata.override_availability_requested = body.override_availability === true;

    const update: Record<string, unknown> = { metadata };
    if (body.customer_id !== undefined) {
      if (!body.customer_id) throw new Error("customer_id cannot be cleared in the canonical appointment workflow");
      update.customerId = body.customer_id;
    }
    if (body.vehicle_id !== undefined) {
      if (!body.vehicle_id) throw new Error("vehicle_id cannot be cleared in the canonical appointment workflow");
      update.vehicleId = body.vehicle_id;
    }
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.service_catalog_id !== undefined) update.serviceIds = body.service_catalog_id ? [body.service_catalog_id] : [];
    await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}`, {
      method: "PATCH",
      headers: { "idempotency-key": `${baseKey}:details` },
      body: JSON.stringify(update),
    });

    const currentStartsAt = String(currentLegacy.starts_at);
    const currentEndsAt = String(currentLegacy.ends_at);
    let startsAt = body.starts_at ?? currentStartsAt;
    let endsAt = body.ends_at ?? currentEndsAt;
    if (body.scheduled_date || body.scheduled_time || body.duration_minutes) {
      const parts = zonedDateTimeParts(new Date(currentStartsAt), timezone);
      const date = `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
      const time = `${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
      const local = zonedLocalDateTimeToUtc(body.scheduled_date ?? date, body.scheduled_time ?? time, timezone);
      startsAt = local.toISOString();
      const duration = body.duration_minutes ?? Math.max(5, Math.round((Date.parse(currentEndsAt) - Date.parse(currentStartsAt)) / 60000));
      endsAt = new Date(local.getTime() + duration * 60000).toISOString();
    } else if (body.starts_at && !body.ends_at) {
      const duration = Math.max(300000, Date.parse(currentEndsAt) - Date.parse(currentStartsAt));
      endsAt = new Date(Date.parse(body.starts_at) + duration).toISOString();
    }
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("ends_at must be after starts_at");

    const scheduleChanged = startsAt !== currentStartsAt || endsAt !== currentEndsAt;
    if (scheduleChanged) {
      const start = isoToWorkspaceSchedule(startsAt, timezone);
      const end = isoToWorkspaceSchedule(endsAt, timezone);
      if (start.localDate !== end.localDate) throw new Error("Appointments must start and end on the same workspace-local date.");
      await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}/reschedule`, {
        method: "POST",
        headers: { "idempotency-key": `${baseKey}:reschedule` },
        body: JSON.stringify({ localDate: start.localDate, startMinute: start.minute, endMinute: end.minute }),
      });
      const latest = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}`);
      const latestMetadata = latest.metadata && typeof latest.metadata === "object" ? { ...latest.metadata } : {};
      latestMetadata.legacy_starts_at = startsAt;
      latestMetadata.legacy_ends_at = endsAt;
      await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}`, {
        method: "PATCH",
        headers: { "idempotency-key": `${baseKey}:schedule-metadata` },
        body: JSON.stringify({ metadata: latestMetadata }),
      });
    }

    if (body.status) {
      const afterUpdates = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${id}`);
      await transitionStatus(request, body.workspace_id, id, afterUpdates.status, body.status, baseKey);
    }

    const data = await finalLegacy(request, body.workspace_id, id, timezone) as Record<string, unknown>;
    const changed = Object.keys(body).filter((key) => key !== "workspace_id" && key !== "override_availability");
    const eventKey = body.status === "cancelled" && current.status !== "cancelled"
      ? LIFECYCLE_EVENT_KEYS.appointmentCancelled
      : scheduleChanged
        ? LIFECYCLE_EVENT_KEYS.appointmentRescheduled
        : LIFECYCLE_EVENT_KEYS.bookingDetailsChanged;
    await notifyLifecycle(request, { eventKey, eventId: `${id}:${eventKey}:${String(data.updated_at ?? Date.now())}`, appointment: data, workspaceName: workspace.name || "Service Writer", timezone, changedFields: changed });
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const workspace = await loadWorkspace(request, workspaceId);
    const timezone = workspace.timezone || "UTC";
    await serviceWriterApi(request, `/api/v1/workspaces/${workspaceId}/appointments/${id}/cancel`, {
      method: "POST",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify({ reason: "Cancelled from ServiceWriterFinal" }),
    });
    const data = await finalLegacy(request, workspaceId, id, timezone) as Record<string, unknown>;
    await notifyLifecycle(request, { eventKey: LIFECYCLE_EVENT_KEYS.appointmentCancelled, eventId: `${id}:cancelled:${String(data.updated_at ?? Date.now())}`, appointment: data, workspaceName: workspace.name || "Service Writer", timezone });
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
