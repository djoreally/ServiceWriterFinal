import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  quotes,
  serviceInspections,
  vehicles,
  workOrders,
  workspaces,
  workspaceSettings,
} from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';
import { sendQuoteApprovedConfirmationEmail } from '@/server/notifications/email-service';

type QuoteDecision = 'approved' | 'declined';

export type DecideQuoteCommand = {
  workspaceId: string;
  quoteId: string;
  decision: QuoteDecision;
  actorUserId?: string | null;
  approvalMethod: 'staff' | 'customer_link';
  termsVersion?: string | null;
  signatureIp?: string | null;
  reason?: string | null;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function decideQuoteCommand(input: DecideQuoteCommand) {
  const db = getDb();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    // 1. Idempotency claim
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.decide',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input,
    });
    if (claim.kind === 'replay') {
      const [existing] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, input.quoteId)))
        .limit(1);
      if (!existing) {
        throw Object.assign(new Error('Idempotent quote result no longer exists'), {
          status: 409,
          code: 'idempotency_resource_gone',
        });
      }
      return existing;
    }

    // 2. Lock quote for update
    const rows = await tx.execute<{
      id: string;
      status: string;
      total: string;
      work_order_id: string | null;
      customer_id: string;
      vehicle_id: string | null;
      metadata: Record<string, unknown> | null;
    }>(sql`
      select id, status, total, work_order_id, customer_id, vehicle_id, metadata
      from quotes
      where workspace_id = ${input.workspaceId} and id = ${input.quoteId}
      for update
    `);

    const current = rows[0];
    if (!current) {
      throw Object.assign(new Error('Quote was not found in this workspace'), {
        status: 404,
        code: 'quote_not_found',
      });
    }

    if (current.status === input.decision) {
      const [existing] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, input.quoteId)))
        .limit(1);
      return existing;
    }

    if (current.status !== 'sent' && current.status !== 'draft') {
      throw Object.assign(
        new Error(`A quote in ${current.status} status cannot be ${input.decision}`),
        {
          status: 409,
          code: 'invalid_quote_transition',
        }
      );
    }

    const decidedAt = new Date();

    // 3. Update Quote State
    const [quote] = await tx
      .update(quotes)
      .set({
        status: input.decision,
        updatedAt: decidedAt,
        metadata: sql`coalesce(${quotes.metadata}, '{}'::jsonb) || ${JSON.stringify({
          decision: {
            method: input.approvalMethod,
            termsVersion: input.termsVersion ?? null,
            signatureIp: input.signatureIp ?? null,
            reason: input.reason ?? null,
            decidedAt: decidedAt.toISOString(),
          },
        })}::jsonb`,
      })
      .where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, input.quoteId)))
      .returning();

    // 4. If approved, synchronize Work Order & Inspection status to active execution
    let workOrderNumber: string | null = null;
    if (input.decision === 'approved' && current.work_order_id) {
      const [wo] = await tx
        .select({ id: workOrders.id, number: workOrders.number, status: workOrders.status })
        .from(workOrders)
        .where(and(eq(workOrders.workspaceId, input.workspaceId), eq(workOrders.id, current.work_order_id)))
        .limit(1);

      if (wo) {
        workOrderNumber = String(wo.number);
        // If work order was awaiting approval or scheduled, move to in_progress upon quote approval
        if (wo.status === 'awaiting_approval' || wo.status === 'scheduled' || wo.status === 'assigned') {
          await tx
            .update(workOrders)
            .set({
              status: 'in_progress',
              updatedAt: decidedAt,
            })
            .where(and(eq(workOrders.workspaceId, input.workspaceId), eq(workOrders.id, wo.id)));
        }
      }

      // If quote had linked inspectionId in metadata, update inspection status to authorized
      const inspectionId = (quote.metadata as Record<string, unknown>)?.inspectionId as string | undefined;
      if (inspectionId) {
        await tx
          .update(serviceInspections)
          .set({
            status: 'authorized',
            updatedAt: decidedAt,
          })
          .where(
            and(
              eq(serviceInspections.workspaceId, input.workspaceId),
              eq(serviceInspections.id, inspectionId)
            )
          );
      }
    }

    // 5. Send Real-Time Confirmation Email to Customer
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.workspaceId, input.workspaceId), eq(customers.id, current.customer_id)))
      .limit(1);

    const [vehicle] = current.vehicle_id
      ? await tx
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.workspaceId, input.workspaceId), eq(vehicles.id, current.vehicle_id)))
          .limit(1)
      : [null];

    const [workspace] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId))
      .limit(1);

    const [settings] = await tx
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, input.workspaceId))
      .limit(1);

    if (input.decision === 'approved' && customer?.email) {
      const vehicleDesc = vehicle
        ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
        : 'Vehicle';

      await sendQuoteApprovedConfirmationEmail({
        quoteId: quote.id,
        quoteTotal: quote.total,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        customerEmail: customer.email,
        vehicleDescription: vehicleDesc,
        shopName: workspace?.name || 'Service Writer Shop',
        shopPhone: settings?.phone,
        shopEmail: settings?.email,
        decidedAt,
        workOrderNumber,
      });
    }

    // 6. Publish Outbox Event
    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: `quote.${input.decision}`,
      payload: {
        quoteId: quote.id,
        workOrderId: current.work_order_id,
        customerId: current.customer_id,
        vehicleId: current.vehicle_id,
        approvedTotal: input.decision === 'approved' ? current.total : null,
        decidedAt: decidedAt.toISOString(),
        decision: input.decision,
        approvalMethod: input.approvalMethod,
        termsVersion: input.termsVersion ?? null,
        signatureIp: input.signatureIp ?? null,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId ?? null,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    // 7. Complete Idempotency
    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.decide',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 200,
      responseBody: { quoteId: quote.id, status: quote.status },
      resourceType: 'quote',
      resourceId: quote.id,
    });

    return quote;
  });
}
