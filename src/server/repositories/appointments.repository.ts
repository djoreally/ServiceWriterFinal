import 'server-only';

import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { appointments, customers, vehicles } from '@/db/schema';

export async function listAppointments(
  workspaceId: string,
  input: { from?: Date; to?: Date; limit: number; offset: number },
) {
  return getDb()
    .select({
      id:appointments.id,status:appointments.status,startsAt:appointments.startsAt,endsAt:appointments.endsAt,
      source:appointments.source,notes:appointments.notes,customerId:appointments.customerId,vehicleId:appointments.vehicleId,
      customerFirstName:customers.firstName,customerLastName:customers.lastName,
      vehicleYear:vehicles.year,vehicleMake:vehicles.make,vehicleModel:vehicles.model,
    })
    .from(appointments)
    .innerJoin(customers,and(eq(customers.workspaceId,workspaceId),eq(customers.id,appointments.customerId)))
    .leftJoin(vehicles,and(eq(vehicles.workspaceId,workspaceId),eq(vehicles.id,appointments.vehicleId)))
    .where(and(
      eq(appointments.workspaceId, workspaceId),
      input.from ? gte(appointments.startsAt, input.from) : undefined,
      input.to ? lt(appointments.startsAt, input.to) : undefined,
    ))
    .orderBy(asc(appointments.startsAt)).limit(input.limit).offset(input.offset);
}
