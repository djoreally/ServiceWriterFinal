import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { appointments, customers, serviceCatalog, vehicles, workspaceSettings, workspaces } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';

export type MarketplaceAttributionInput = {
  partnerId: string;
  campaignId?: string | null;
  signature: string;
};

export type CreatePublicBookingInput = {
  slug: string;
  serviceId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  year: number | null;
  make: string;
  model: string;
  trim: string | null;
  vin: string | null;
  startsAt: Date;
  notes: string | null;
  marketplaceAttribution?: MarketplaceAttributionInput | null;
};

function verifyMarketplaceAttribution(
  attribution?: MarketplaceAttributionInput | null,
): { verified: boolean; partnerId?: string; campaignId?: string } {
  if (!attribution?.partnerId || !attribution?.signature) return { verified: false };
  const secret = process.env.MARKETPLACE_SIGNING_SECRET || process.env.CRON_SECRET || 'marketplace-default-secret';
  const expected = createHmac('sha256', secret)
    .update(`${attribution.partnerId}:${attribution.campaignId || ''}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(attribution.signature);
  if (expectedBuf.length !== providedBuf.length) return { verified: false };
  if (!timingSafeEqual(expectedBuf, providedBuf)) return { verified: false };
  return { verified: true, partnerId: attribution.partnerId, campaignId: attribution.campaignId || undefined };
}

export async function getPublicBookingContext(slug: string) {
  const [ctx] = await getDb()
    .select({
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      timezone: workspaces.timezone,
      bookingEnabled: workspaceSettings.bookingEnabled,
      minLeadTimeHours: workspaceSettings.minLeadTimeHours,
      maxAdvanceDays: workspaceSettings.maxAdvanceDays,
      slotDurationMinutes: workspaceSettings.slotDurationMinutes,
    })
    .from(workspaceSettings)
    .innerJoin(workspaces, eq(workspaces.id, workspaceSettings.workspaceId))
    .where(
      and(
        eq(workspaceSettings.bookingSlug, slug),
        eq(workspaceSettings.bookingEnabled, true),
        eq(workspaces.isActive, true),
      ),
    )
    .limit(1);

  if (!ctx) return null;

  const services = await getDb()
    .select({
      id: serviceCatalog.id,
      name: serviceCatalog.name,
      description: serviceCatalog.description,
      estimatedMinutes: serviceCatalog.estimatedMinutes,
      laborPrice: serviceCatalog.laborPrice,
    })
    .from(serviceCatalog)
    .where(and(eq(serviceCatalog.workspaceId, ctx.workspaceId), eq(serviceCatalog.isActive, true)));

  return { ...ctx, services };
}

export async function createPublicBooking(input: CreatePublicBookingInput) {
  if (!input.email && !input.phone) {
    throw Object.assign(new Error('Enter an email address or phone number.'), {
      status: 400,
      code: 'booking_contact_required',
    });
  }

  const context = await getPublicBookingContext(input.slug);
  if (!context) {
    throw Object.assign(new Error('Booking is unavailable for this business.'), {
      status: 404,
      code: 'booking_unavailable',
    });
  }

  const service = context.services.find((s) => s.id === input.serviceId);
  if (!service) {
    throw Object.assign(new Error('Selected service is unavailable.'), {
      status: 400,
      code: 'invalid_service',
    });
  }

  const duration = service.estimatedMinutes ?? context.slotDurationMinutes ?? 60;
  const endsAt = new Date(input.startsAt.getTime() + duration * 60000);
  const now = new Date();
  const min = new Date(now.getTime() + (context.minLeadTimeHours ?? 2) * 3600000);
  const max = new Date(now.getTime() + (context.maxAdvanceDays ?? 30) * 86400000);

  if (input.startsAt < min) {
    throw Object.assign(new Error('That time is inside the minimum lead-time window.'), {
      status: 409,
      code: 'booking_min_lead',
    });
  }
  if (input.startsAt > max) {
    throw Object.assign(new Error('That date is too far in advance.'), {
      status: 409,
      code: 'booking_max_advance',
    });
  }

  const attribution = verifyMarketplaceAttribution(input.marketplaceAttribution);
  const source = attribution.verified ? 'marketplace' : 'public_booking';

  const db = getDb();
  return db.transaction(async (tx) => {
    // Acquire transaction lock on slot to prevent concurrent double-booking
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${context.workspaceId}:${input.startsAt.toISOString()}`}, 0))`,
    );

    const conflict = await tx
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.workspaceId, context.workspaceId),
          sql`${appointments.status} not in ('cancelled','no_show')`,
          sql`${appointments.startsAt} < ${endsAt} and ${appointments.endsAt} > ${input.startsAt}`,
        ),
      )
      .limit(1);

    if (conflict.length > 0) {
      throw Object.assign(new Error('That time is no longer available.'), {
        status: 409,
        code: 'booking_conflict',
      });
    }

    let customerId: string | undefined;
    if (input.email || input.phone) {
      const [existing] = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(
          and(
            eq(customers.workspaceId, context.workspaceId),
            or(
              input.email ? eq(customers.email, input.email) : undefined,
              input.phone ? eq(customers.phone, input.phone) : undefined,
            ),
          ),
        )
        .limit(1);
      customerId = existing?.id;
    }

    if (!customerId) {
      customerId = randomUUID();
      await tx.insert(customers).values({
        id: customerId,
        workspaceId: context.workspaceId,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        status: 'active',
        metadata: { source },
      });
    }

    const vehicleId = randomUUID();
    await tx.insert(vehicles).values({
      id: vehicleId,
      workspaceId: context.workspaceId,
      customerId,
      status: 'active',
      year: input.year,
      make: input.make,
      model: input.model,
      trim: input.trim,
      vin: input.vin?.toUpperCase() ?? null,
      mileageUnit: 'mi',
      metadata: { source },
    });

    const appointmentId = randomUUID();
    const confirmationCode = appointmentId.slice(0, 8).toUpperCase();

    const [appointment] = await tx
      .insert(appointments)
      .values({
        id: appointmentId,
        workspaceId: context.workspaceId,
        customerId,
        vehicleId,
        status: 'requested',
        startsAt: input.startsAt,
        endsAt,
        source,
        confirmationCode,
        notes: input.notes,
        metadata: {
          publicBooking: {
            serviceCatalogId: service.id,
            serviceName: service.name,
            quotedLaborPrice: service.laborPrice,
            ...(attribution.verified ? { partnerId: attribution.partnerId, campaignId: attribution.campaignId } : {}),
          },
        },
      })
      .returning();

    await publishDomainEvent(tx, {
      workspaceId: context.workspaceId,
      aggregateType: 'appointment',
      aggregateId: appointment.id,
      eventType: 'appointment.created',
      eventVersion: 1,
      idempotencyKey: `public-booking:${appointment.id}`,
      payload: {
        appointmentId: appointment.id,
        customerId,
        vehicleId,
        serviceCatalogId: service.id,
        source,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        confirmationCode,
        ...(attribution.verified ? { marketplacePartnerId: attribution.partnerId } : {}),
      },
    });

    return {
      appointment,
      confirmationCode,
      workspaceName: context.workspaceName,
      serviceName: service.name,
      source,
    };
  });
}
