import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { invoices, payments } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';

type PaymentProvider = typeof payments.$inferInsert.provider;

export type RecordSuccessfulPaymentCommand = {
  workspaceId: string;
  invoiceId: string;
  provider: NonNullable<PaymentProvider>;
  providerPaymentId: string;
  amountMinor: number;
  currencyCode: string;
  paidAt: Date;
  actorUserId?: string | null;
  traceId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
};

function decimalToCents(value: string) {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

function centsToDecimal(value: number) {
  return (value / 100).toFixed(2);
}

export async function recordSuccessfulPaymentCommand(input: RecordSuccessfulPaymentCommand) {
  const db = getDb();
  const paymentId = randomUUID();
  const correlationId = randomUUID();

  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw Object.assign(new Error('Provider payment amount must be a positive integer in minor units'), {
      status: 400,
      code: 'invalid_payment_amount_minor',
    });
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.provider}:${input.providerPaymentId}`}, 0))`);

    const existingRows = await tx.execute<{ id: string }>(sql`
      select id from payments
      where provider=${input.provider} and provider_payment_id=${input.providerPaymentId}
      limit 1
      for update
    `);
    if (existingRows[0]) {
      const [existing] = await tx.select().from(payments).where(eq(payments.id, existingRows[0].id)).limit(1);
      if (
        !existing ||
        existing.workspaceId !== input.workspaceId ||
        existing.invoiceId !== input.invoiceId ||
        decimalToCents(existing.amount) !== input.amountMinor ||
        existing.currencyCode.toUpperCase() !== input.currencyCode.toUpperCase() ||
        existing.status !== 'succeeded'
      ) {
        throw Object.assign(new Error('Provider payment identifier conflicts with an existing payment'), {
          status: 409,
          code: 'provider_payment_integrity_conflict',
        });
      }
      return { payment: existing, duplicate: true };
    }

    const invoiceRows = await tx.execute<{
      id: string;
      customer_id: string;
      status: string;
      total: string;
      amount_paid: string;
    }>(sql`
      select id, customer_id, status, total, amount_paid
      from invoices
      where workspace_id=${input.workspaceId} and id=${input.invoiceId}
      for update
    `);
    const invoice = invoiceRows[0];
    if (!invoice) throw Object.assign(new Error('Invoice was not found in this workspace'), { status: 404, code: 'invoice_not_found' });
    if (invoice.status === 'void') throw Object.assign(new Error('A void invoice cannot accept payment'), { status: 409, code: 'invoice_void' });

    const paymentCents = input.amountMinor;
    const paymentAmount = centsToDecimal(paymentCents);
    const totalCents = decimalToCents(invoice.total);
    const alreadyPaidCents = decimalToCents(invoice.amount_paid);
    if (alreadyPaidCents + paymentCents > totalCents) {
      throw Object.assign(new Error('Payment would exceed the invoice balance'), { status: 409, code: 'payment_exceeds_balance' });
    }

    const [payment] = await tx.insert(payments).values({
      id: paymentId,
      workspaceId: input.workspaceId,
      invoiceId: input.invoiceId,
      customerId: invoice.customer_id,
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      status: 'succeeded',
      amount: paymentAmount,
      currencyCode: input.currencyCode.toUpperCase(),
      paidAt: input.paidAt,
      createdBy: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
    }).returning();

    const newPaidCents = alreadyPaidCents + paymentCents;
    const invoiceStatus = newPaidCents === totalCents ? 'paid' : 'partially_paid';
    const [updatedInvoice] = await tx.update(invoices).set({
      amountPaid: centsToDecimal(newPaidCents),
      status: invoiceStatus,
      updatedAt: new Date(),
    }).where(and(
      eq(invoices.workspaceId,input.workspaceId),
      eq(invoices.id,input.invoiceId),
    )).returning();

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'payment',
      aggregateId: payment.id,
      eventType: 'payment.succeeded',
      payload: {
        paymentId: payment.id,
        invoiceId: input.invoiceId,
        customerId: invoice.customer_id,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amount: paymentAmount,
        currencyCode: payment.currencyCode,
        paidAt: input.paidAt.toISOString(),
        invoiceAmountPaid: updatedInvoice.amountPaid,
        invoiceTotal: updatedInvoice.total,
        invoiceStatus: updatedInvoice.status,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    return { payment, invoice: updatedInvoice, duplicate: false };
  });
}
