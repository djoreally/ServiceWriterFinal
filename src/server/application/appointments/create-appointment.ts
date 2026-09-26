import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { appointments, customers, locations, vehicles, workspaceMembers, workspaces, workspaceSettings } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

type AppointmentInsert = typeof appointments.$inferInsert;

export type CreateAppointmentCommand = Omit<
  AppointmentInsert,
  'id' | 'workspaceId' | 'createdBy' | 'status'
> & {
  workspaceId: string;
  actorUserId: string;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function createAppointmentCommand(input: CreateAppointmentCommand) {
  const db = getDb();
  const appointmentId = randomUUID();
  const correlationId = randomUUID();
  const {
    actorUserId,
    traceId,
    idempotencyKey,
    workspaceId,
    customerId,
    vehicleId,
    locationId,
    assignedUserId,
    ...appointmentValues
  } = input;

  if (appointmentValues.endsAt <= appointmentValues.startsAt) {
    throw Object.assign(new Error('Appointment end time must be after its start time'), {
      status: 400,
      code: 'invalid_appointment_window',
    });
  }

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId,
      commandName: 'appointment.create',
      idempotencyKey,
      requestFingerprint: { actorUserId, customerId, vehicleId, locationId, appointmentValues },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent appointment result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(appointments).where(and(eq(appointments.workspaceId, workspaceId), eq(appointments.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent appointment result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const [scheduling] = await tx
      .select({
        timezone: workspaces.timezone,
        bookingEnabled: workspaceSettings.bookingEnabled,
        minLeadTimeHours: workspaceSettings.minLeadTimeHours,
        maxAdvanceDays: workspaceSettings.maxAdvanceDays,
        allowMultiDayBookings: workspaceSettings.allowMultiDayBookings,
      })
      .from(workspaces)
      .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, workspaces.id))
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!scheduling) {
      throw Object.assign(new Error('Workspace scheduling configuration was not found'), {
        status: 400,
        code: 'workspace_scheduling_missing',
      });
    }

    // Staff commands may create appointments while public booking is disabled,
    // but the workspace's lead/advance and multi-day safety rules still apply.
    const now = new Date();
    const minimumStart = new Date(now.getTime() + (scheduling.minLeadTimeHours ?? 2) * 60 * 60 * 1000);
    const maximumStart = new Date(now.getTime() + (scheduling.maxAdvanceDays ?? 30) * 24 * 60 * 60 * 1000);

    if (appointmentValues.startsAt < minimumStart) {
      throw Object.assign(new Error('Appointment is inside the workspace minimum lead-time window'), {
        status: 409,
        code: 'appointment_min_lead_time',
      });
    }

    if (appointmentValues.startsAt > maximumStart) {
      throw Object.assign(new Error('Appointment is beyond the workspace maximum advance window'), {
        status: 409,
        code: 'appointment_max_advance',
      });
    }

    if (!scheduling.allowMultiDayBookings) {
      const dateFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: scheduling.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      if (dateFormatter.format(appointmentValues.startsAt) !== dateFormatter.format(appointmentValues.endsAt)) {
        throw Object.assign(new Error('Multi-day appointments are disabled for this workspace'), {
          status: 409,
          code: 'multi_day_booking_disabled',
        });
      }
    }

    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.workspaceId, workspaceId),
        eq(customers.id, customerId),
        ne(customers.status, 'archived'),
      ))
      .limit(1);

    if (!customer) {
      throw Object.assign(new Error('Customer does not belong to this workspace'), {
        status: 400,
        code: 'invalid_customer',
      });
    }

    if (vehicleId) {
      const [vehicle] = await tx
        .select({ id: vehicles.id, customerId: vehicles.customerId })
        .from(vehicles)
        .where(and(
          eq(vehicles.workspaceId, workspaceId),
          eq(vehicles.id, vehicleId),
          ne(vehicles.status, 'archived'),
        ))
        .limit(1);

      if (!vehicle) {
        throw Object.assign(new Error('Vehicle does not belong to this workspace'), {
          status: 400,
          code: 'invalid_vehicle',
        });
      }

      if (vehicle.customerId && vehicle.customerId !== customerId) {
        throw Object.assign(new Error('Vehicle belongs to a different customer'), {
          status: 409,
          code: 'vehicle_customer_mismatch',
        });
      }
    }

    if (assignedUserId) {
      const [assignee] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, assignedUserId),
          eq(workspaceMembers.isActive, true),
        ))
        .limit(1);

      if (!assignee) {
        throw Object.assign(new Error('Assigned user is not an active member of this workspace'), {
          status: 400,
          code: 'invalid_assigned_user',
        });
      }
    }

    if (locationId) {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(and(
          eq(locations.workspaceId, workspaceId),
          eq(locations.id, locationId),
          eq(locations.isActive, true),
        ))
        .limit(1);

      if (!location) {
        throw Object.assign(new Error('Location is not active in this workspace'), {
          status: 400,
          code: 'invalid_location',
        });
      }
    }

    const [appointment] = await tx
      .insert(appointments)
      .values({
        ...appointmentValues,
        id: appointmentId,
        workspaceId,
        customerId,
        vehicleId,
        locationId,
        assignedUserId,
        status: 'requested',
        createdBy: actorUserId,
      })
      .returning();

    await publishDomainEvent(tx, {
      workspaceId,
      aggregateType: 'appointment',
      aggregateId: appointment.id,
      eventType: 'appointment.created',
      payload: {
        appointmentId: appointment.id,
        customerId,
        vehicleId,
        locationId,
        assignedUserId,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        status: appointment.status,
        schedulingPolicy: {
          timezone: scheduling.timezone,
          minLeadTimeHours: scheduling.minLeadTimeHours ?? 2,
          maxAdvanceDays: scheduling.maxAdvanceDays ?? 30,
          allowMultiDayBookings: scheduling.allowMultiDayBookings ?? false,
        },
      },
      traceId: traceId ?? null,
      correlationId,
      idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId,
      commandName: 'appointment.create',
      idempotencyKey,
      responseStatus: 201,
      responseBody: { appointmentId: appointment.id },
      resourceType: 'appointment',
      resourceId: appointment.id,
    });

    return appointment;
  });
}
