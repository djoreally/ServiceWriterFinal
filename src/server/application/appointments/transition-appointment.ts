import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { appointments } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

type AppointmentStatus = typeof appointments.$inferSelect.status;

const allowedTransitions: Readonly<Record<AppointmentStatus, readonly AppointmentStatus[]>> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export type TransitionAppointmentCommand = {
  workspaceId: string;
  appointmentId: string;
  targetStatus: AppointmentStatus;
  actorUserId: string;
  traceId?: string | null;
  idempotencyKey: string;
  reason?: string | null;
};

export async function transitionAppointmentCommand(input: TransitionAppointmentCommand) {
  const db = getDb();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'appointment.transition',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: {
        appointmentId: input.appointmentId,
        targetStatus: input.targetStatus,
        actorUserId: input.actorUserId,
        reason: input.reason ?? null,
      },
    });
    if (claim.kind === 'replay') {
      const [existing] = await tx.select().from(appointments).where(and(
        eq(appointments.workspaceId, input.workspaceId),
        eq(appointments.id, input.appointmentId),
      )).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent appointment result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    // Lock the aggregate so two staff actions cannot both transition from the same stale state.
    const rows = await tx.execute<{ status: AppointmentStatus }>(
      sql`select status from appointments where workspace_id = ${input.workspaceId} and id = ${input.appointmentId} for update`,
    );
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Appointment was not found in this workspace'), { status: 404, code: 'appointment_not_found' });

    if (current.status === input.targetStatus) {
      const [existing] = await tx.select().from(appointments).where(and(
        eq(appointments.workspaceId, input.workspaceId),
        eq(appointments.id, input.appointmentId),
      )).limit(1);
      return existing;
    }

    if (!allowedTransitions[current.status].includes(input.targetStatus)) {
      throw Object.assign(new Error(`Appointment cannot transition from ${current.status} to ${input.targetStatus}`), {
        status: 409,
        code: 'invalid_appointment_transition',
      });
    }

    const [appointment] = await tx.update(appointments).set({
      status: input.targetStatus,
      updatedAt: new Date(),
    }).where(and(
      eq(appointments.workspaceId, input.workspaceId),
      eq(appointments.id, input.appointmentId),
    )).returning();

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'appointment',
      aggregateId: appointment.id,
      eventType: `appointment.${input.targetStatus}`,
      payload: {
        appointmentId: appointment.id,
        previousStatus: current.status,
        status: appointment.status,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'appointment.transition',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 200,
      responseBody: { appointmentId: appointment.id, status: appointment.status },
      resourceType: 'appointment',
      resourceId: appointment.id,
    });

    return appointment;
  });
}
