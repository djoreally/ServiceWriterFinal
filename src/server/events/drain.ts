import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  domainEvents,
  eventConsumerExecutions,
  eventDeliveries,
  invoices,
  payments,
  quotes,
  workspaceSettings,
  workOrders,
  workspaces,
} from '@/db/schema';

type ClaimedDelivery = {
  event_id: string;
  attempt_count: number;
  max_attempts: number;
};

type EventRow = typeof domainEvents.$inferSelect;

const EMAIL_EVENTS = new Set([
  'appointment.created',
  'work_order.completed',
  'quote.sent',
  'invoice.issued',
  'payment.succeeded',
]);

function textPayload(payload: unknown, key: string) {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character] ?? character);
}

async function claimDeliveries(workerId: string, limit: number) {
  return getDb().transaction(async (tx) => {
    const rows = await tx.execute<ClaimedDelivery>(sql`
      with candidates as (
        select event_id
        from event_deliveries
        where (
          status = 'pending'
          or (status = 'processing' and locked_at < clock_timestamp() - interval '5 minutes')
        )
          and available_at <= clock_timestamp()
        order by available_at asc
        for update skip locked
        limit ${limit}
      )
      update event_deliveries d
      set status = 'processing',
          locked_at = clock_timestamp(),
          locked_by = ${workerId},
          attempt_count = d.attempt_count + 1,
          last_error = null
      from candidates c
      where d.event_id = c.event_id
      returning d.event_id, d.attempt_count, d.max_attempts
    `);
    return Array.from(rows);
  });
}

async function resolveCustomerId(event: EventRow) {
  const payloadCustomerId = textPayload(event.payload, 'customerId');
  if (payloadCustomerId) return payloadCustomerId;

  if (event.aggregateType === 'work_order') {
    const [row] = await getDb().select({ customerId: workOrders.customerId })
      .from(workOrders)
      .where(and(eq(workOrders.workspaceId, event.workspaceId), eq(workOrders.id, event.aggregateId)))
      .limit(1);
    return row?.customerId ?? null;
  }
  if (event.aggregateType === 'quote') {
    const [row] = await getDb().select({ customerId: quotes.customerId })
      .from(quotes)
      .where(and(eq(quotes.workspaceId, event.workspaceId), eq(quotes.id, event.aggregateId)))
      .limit(1);
    return row?.customerId ?? null;
  }
  if (event.aggregateType === 'invoice') {
    const [row] = await getDb().select({ customerId: invoices.customerId })
      .from(invoices)
      .where(and(eq(invoices.workspaceId, event.workspaceId), eq(invoices.id, event.aggregateId)))
      .limit(1);
    return row?.customerId ?? null;
  }
  if (event.aggregateType === 'payment') {
    const [row] = await getDb().select({ customerId: payments.customerId })
      .from(payments)
      .where(and(eq(payments.workspaceId, event.workspaceId), eq(payments.id, event.aggregateId)))
      .limit(1);
    return row?.customerId ?? null;
  }
  return null;
}

async function notificationContext(event: EventRow) {
  const customerId = await resolveCustomerId(event);
  if (!customerId) return null;

  const [row] = await getDb().select({
    firstName: customers.firstName,
    lastName: customers.lastName,
    email: customers.email,
    businessName: workspaces.name,
    businessEmail: workspaceSettings.email,
    businessPhone: workspaceSettings.phone,
    timezone: workspaces.timezone,
  }).from(customers)
    .innerJoin(workspaces, eq(workspaces.id, customers.workspaceId))
    .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, customers.workspaceId))
    .where(and(eq(customers.workspaceId, event.workspaceId), eq(customers.id, customerId)))
    .limit(1);

  return row ?? null;
}

function emailCopy(event: EventRow, context: NonNullable<Awaited<ReturnType<typeof notificationContext>>>) {
  const name = context.firstName || 'Customer';
  const business = context.businessName;
  const payload = event.payload as Record<string, unknown>;
  const total = typeof payload.total === 'string' ? payload.total : null;
  const confirmationCode = typeof payload.confirmationCode === 'string' ? payload.confirmationCode : null;
  const startsAt = typeof payload.startsAt === 'string' ? new Date(payload.startsAt) : null;

  if (event.eventType === 'appointment.created') {
    const when = startsAt && !Number.isNaN(startsAt.getTime())
      ? new Intl.DateTimeFormat('en-US', { timeZone: context.timezone, dateStyle: 'full', timeStyle: 'short' }).format(startsAt)
      : null;
    return {
      subject: `${business}: appointment request received`,
      body: `Hi ${name},\n\nWe received your appointment request${when ? ' for ' + when : ''}.${confirmationCode ? '\nConfirmation: ' + confirmationCode : ''}\n\n${business}`,
    };
  }
  if (event.eventType === 'work_order.completed') {
    return {
      subject: `${business}: service completed`,
      body: `Hi ${name},\n\nYour service has been marked complete. Thank you for choosing ${business}.\n\n${business}`,
    };
  }
  if (event.eventType === 'quote.sent') {
    return {
      subject: `${business}: quote ready`,
      body: `Hi ${name},\n\nYour service quote is ready${total ? ' for $' + total : ''}. Please contact ${business} if you have any questions.\n\n${business}`,
    };
  }
  if (event.eventType === 'invoice.issued') {
    return {
      subject: `${business}: invoice issued`,
      body: `Hi ${name},\n\nYour invoice has been issued${total ? ' for $' + total : ''}.\n\n${business}`,
    };
  }
  return {
    subject: `${business}: payment received`,
    body: `Hi ${name},\n\nWe received your payment${typeof payload.amount === 'string' ? ' of $' + payload.amount : ''}. Thank you.\n\n${business}`,
  };
}

async function sendEmail(event: EventRow) {
  const consumerName = 'customer-email';
  const [existing] = await getDb().select({ status: eventConsumerExecutions.status })
    .from(eventConsumerExecutions)
    .where(and(eq(eventConsumerExecutions.eventId, event.id), eq(eventConsumerExecutions.consumerName, consumerName)))
    .limit(1);
  if (existing?.status === 'completed') return;

  await getDb().execute(sql`
    insert into event_consumer_executions (
      event_id, consumer_name, status, external_idempotency_key, started_at, attempt_count
    ) values (
      ${event.id}, ${consumerName}, 'started', ${event.id + ':' + consumerName}, clock_timestamp(), 1
    )
    on conflict (event_id, consumer_name)
    do update set
      status = 'started',
      started_at = clock_timestamp(),
      attempt_count = event_consumer_executions.attempt_count + 1,
      last_error = null
  `);

  const context = await notificationContext(event);
  if (!context?.email) {
    await getDb().execute(sql`
      update event_consumer_executions
      set status='completed', completed_at=clock_timestamp(), provider_reference='skipped:no_email'
      where event_id=${event.id} and consumer_name=${consumerName}
    `);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error('Transactional email is not configured.');
  }

  const copy = emailCopy(event, context);
  const replyTo = context.businessEmail ?? undefined;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
      'Idempotency-Key': event.id + ':' + consumerName,
    },
    body: JSON.stringify({
      from,
      to: [context.email],
      subject: copy.subject,
      text: copy.body,
      html: '<div style="font-family:Arial,sans-serif;white-space:pre-line">' + escapeHtml(copy.body) + '</div>',
      reply_to: replyTo,
    }),
  });

  const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) {
    throw new Error(responseBody.message || 'Email provider rejected the notification.');
  }

  await getDb().execute(sql`
    update event_consumer_executions
    set status='completed', completed_at=clock_timestamp(), provider_reference=${responseBody.id ?? 'resend:accepted'}
    where event_id=${event.id} and consumer_name=${consumerName}
  `);
}

async function markDeliveryCompleted(eventId: string) {
  await getDb().update(eventDeliveries).set({
    status: 'completed',
    completedAt: new Date(),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
  }).where(eq(eventDeliveries.eventId, eventId));
}

async function markDeliveryFailed(delivery: ClaimedDelivery, error: unknown) {
  const message = error instanceof Error ? error.message.slice(0, 2000) : 'Unknown event consumer failure';
  const terminal = delivery.attempt_count >= delivery.max_attempts;
  const delaySeconds = Math.min(3600, 30 * Math.pow(2, Math.max(0, delivery.attempt_count - 1)));
  await getDb().update(eventDeliveries).set({
    status: terminal ? 'dead_letter' : 'pending',
    availableAt: terminal ? new Date() : new Date(Date.now() + delaySeconds * 1000),
    lockedAt: null,
    lockedBy: null,
    lastError: message,
  }).where(eq(eventDeliveries.eventId, delivery.event_id));

  await getDb().execute(sql`
    update event_consumer_executions
    set status='failed', last_error=${message}
    where event_id=${delivery.event_id} and status='started'
  `);
}

export async function drainDomainEvents(input?: { workerId?: string; limit?: number }) {
  const workerId = input?.workerId ?? 'service-writer';
  const limit = Math.min(Math.max(input?.limit ?? 20, 1), 100);
  const claimed = await claimDeliveries(workerId, limit);
  if (!claimed.length) return { claimed: 0, completed: 0, failed: 0, deadLettered: 0 };

  const ids = claimed.map((delivery) => delivery.event_id);
  const events = await getDb().select().from(domainEvents).where(inArray(domainEvents.id, ids));
  const byId = new Map(events.map((event) => [event.id, event]));

  let completed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const delivery of claimed) {
    const event = byId.get(delivery.event_id);
    if (!event) {
      await markDeliveryFailed(delivery, new Error('Domain event row is missing.'));
      failed += 1;
      if (delivery.attempt_count >= delivery.max_attempts) deadLettered += 1;
      continue;
    }

    try {
      if (EMAIL_EVENTS.has(event.eventType)) await sendEmail(event);
      await markDeliveryCompleted(event.id);
      completed += 1;
    } catch (error) {
      await markDeliveryFailed(delivery, error);
      failed += 1;
      if (delivery.attempt_count >= delivery.max_attempts) deadLettered += 1;
    }
  }

  return { claimed: claimed.length, completed, failed, deadLettered };
}
