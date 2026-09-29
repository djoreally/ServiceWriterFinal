import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  inspectionResults,
  quoteItems,
  quotes,
  serviceInspections,
  vehicles,
  workOrders,
  workspaces,
  workspaceSettings,
} from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';
import {
  InspectionItemSummary,
  sendInspectionQuoteEmail,
} from '@/server/notifications/email-service';
import { generateQuotePortalToken } from '@/server/auth/portal-token';

export type CreateQuoteFromInspectionCommand = {
  workspaceId: string;
  workOrderId: string;
  inspectionId?: string | null;
  actorUserId: string;
  customItemPrices?: Record<string, string>;
  sendEmailImmediately?: boolean;
  appBaseUrl?: string;
  expiresAt?: Date | null;
  traceId?: string | null;
  idempotencyKey: string;
};

function decimalToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const str = String(value).trim();
  if (!str) return 0;
  const [whole, fraction = ''] = str.split('.');
  const wholeCents = Number(whole) * 100;
  const fractionCents = Number((fraction + '00').slice(0, 2));
  return (Number.isFinite(wholeCents) ? wholeCents : 0) + (Number.isFinite(fractionCents) ? fractionCents : 0);
}

function centsToDecimal(value: number): string {
  return (value / 100).toFixed(2);
}

export async function createQuoteFromInspectionCommand(input: CreateQuoteFromInspectionCommand) {
  const db = getDb();
  const quoteId = randomUUID();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    // 1. Idempotency claim
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.create_from_inspection',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: {
        workOrderId: input.workOrderId,
        inspectionId: input.inspectionId ?? null,
        actorUserId: input.actorUserId,
      },
    });

    if (claim.kind === 'replay') {
      if (!claim.resourceId) {
        throw Object.assign(new Error('Idempotent quote result is missing'), {
          status: 500,
          code: 'idempotency_resource_missing',
        });
      }
      const [existing] = await tx
        .select()
        .from(quotes)
        .where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, claim.resourceId)))
        .limit(1);

      if (!existing) {
        throw Object.assign(new Error('Idempotent quote result no longer exists'), {
          status: 409,
          code: 'idempotency_resource_gone',
        });
      }
      const existingItems = await tx
        .select()
        .from(quoteItems)
        .where(and(eq(quoteItems.workspaceId, input.workspaceId), eq(quoteItems.quoteId, existing.id)))
        .orderBy(asc(quoteItems.createdAt));

      const expiresAt = existing.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const token = generateQuotePortalToken(input.workspaceId, existing.id, expiresAt);
      const baseUrl = input.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const portalUrl = `${baseUrl.replace(/\/$/, '')}/portal/quotes/${existing.id}?token=${encodeURIComponent(token)}`;

      return { quote: existing, items: existingItems, portalUrl };
    }

    // 2. Fetch Work Order & Context
    const [workOrder] = await tx
      .select({
        id: workOrders.id,
        workOrderNumber: workOrders.number,
        customerId: workOrders.customerId,
        vehicleId: workOrders.vehicleId,
        status: workOrders.status,
      })
      .from(workOrders)
      .where(and(eq(workOrders.workspaceId, input.workspaceId), eq(workOrders.id, input.workOrderId)))
      .limit(1);

    if (!workOrder) {
      throw Object.assign(new Error('Work order was not found in this workspace'), {
        status: 404,
        code: 'work_order_not_found',
      });
    }

    if (workOrder.status === 'cancelled') {
      throw Object.assign(new Error('A quote cannot be created from a cancelled work order'), {
        status: 409,
        code: 'work_order_cancelled',
      });
    }

    // 3. Fetch Customer, Vehicle, Shop Settings
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.workspaceId, input.workspaceId), eq(customers.id, workOrder.customerId)))
      .limit(1);

    if (!customer) {
      throw Object.assign(new Error('Customer associated with work order was not found'), {
        status: 404,
        code: 'customer_not_found',
      });
    }

    const [vehicle] = workOrder.vehicleId
      ? await tx
          .select()
          .from(vehicles)
          .where(and(eq(vehicles.workspaceId, input.workspaceId), eq(vehicles.id, workOrder.vehicleId)))
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

    // 4. Fetch Inspection & Results
    let inspection: typeof serviceInspections.$inferSelect | null = null;
    if (input.inspectionId) {
      const [insp] = await tx
        .select()
        .from(serviceInspections)
        .where(
          and(
            eq(serviceInspections.workspaceId, input.workspaceId),
            eq(serviceInspections.id, input.inspectionId)
          )
        )
        .limit(1);
      inspection = insp ?? null;
    } else if (workOrder.vehicleId) {
      const [insp] = await tx
        .select()
        .from(serviceInspections)
        .where(
          and(
            eq(serviceInspections.workspaceId, input.workspaceId),
            eq(serviceInspections.vehicleId, workOrder.vehicleId)
          )
        )
        .orderBy(desc(serviceInspections.createdAt))
        .limit(1);
      inspection = insp ?? null;
    }

    const inspectionItemRows = inspection
      ? await tx
          .select()
          .from(inspectionResults)
          .where(
            and(
              eq(inspectionResults.workspaceId, input.workspaceId),
              eq(inspectionResults.inspectionId, inspection.id)
            )
          )
          .orderBy(asc(inspectionResults.sortOrder))
      : [];

    // 5. Build Quote Line Items from Flagged Inspection Results or Defaults
    const itemsToQuote: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      lineCents: number;
      inspectionResultId?: string;
    }> = [];

    const defaultPriceByItem: Record<string, string> = {
      Brakes: '185.00',
      Tires: '140.00',
      Battery: '165.00',
      Fluids: '89.95',
      Suspension: '240.00',
      Alignment: '119.00',
      'Air Filter': '45.00',
      'Cabin Filter': '49.00',
      Wipers: '35.00',
    };

    if (inspectionItemRows.length > 0) {
      for (const item of inspectionItemRows) {
        if (item.status === 'urgent' || item.status === 'attention') {
          const customPrice = input.customItemPrices?.[item.id] || input.customItemPrices?.[item.itemName];
          const matchedCategory = Object.keys(defaultPriceByItem).find(
            (k) =>
              item.itemName.toLowerCase().includes(k.toLowerCase()) ||
              (item.itemCategory && item.itemCategory.toLowerCase().includes(k.toLowerCase()))
          );
          const price = customPrice || (matchedCategory ? defaultPriceByItem[matchedCategory] : '95.00');
          const lineCents = decimalToCents(price);

          const descSuffix = item.status === 'urgent' ? ' [URGENT SAFETY REPAIR]' : ' [RECOMMENDED SERVICE]';
          const description = `${item.itemName}${descSuffix}${item.notes ? ` - ${item.notes}` : ''}`;

          itemsToQuote.push({
            description,
            quantity: '1',
            unitPrice: centsToDecimal(lineCents),
            lineCents,
            inspectionResultId: item.id,
          });
        }
      }
    }

    // If no urgent/attention items, include standard inspection diagnostic rate or safety check
    if (itemsToQuote.length === 0) {
      const basicInspectionFee = '89.00';
      const lineCents = decimalToCents(basicInspectionFee);
      itemsToQuote.push({
        description: `${inspection?.templateName || 'Digital Multi-Point Inspection'} Safety Review & Diagnostics`,
        quantity: '1',
        unitPrice: basicInspectionFee,
        lineCents,
      });
    }

    // 6. Precise Currency Calculation
    let subtotalCents = 0;
    const taxRatePercent = Number(settings?.taxRate || 0);

    for (const item of itemsToQuote) {
      subtotalCents += item.lineCents;
    }

    const taxCents = Math.round((subtotalCents * taxRatePercent) / 100);
    const totalCents = subtotalCents + taxCents;

    const subtotal = centsToDecimal(subtotalCents);
    const taxTotal = centsToDecimal(taxCents);
    const total = centsToDecimal(totalCents);

    const expiresAt = input.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    // 7. Insert Quote & Quote Items
    const [quote] = await tx
      .insert(quotes)
      .values({
        id: quoteId,
        workspaceId: input.workspaceId,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
        workOrderId: workOrder.id,
        status: 'sent', // Auto-set to 'sent' when generated with email dispatch
        subtotal,
        taxTotal,
        total,
        expiresAt,
        createdBy: input.actorUserId,
        metadata: {
          inspectionId: inspection?.id ?? null,
          inspectionTemplateName: inspection?.templateName ?? null,
          inspectorName: inspection?.inspectorName ?? null,
          inspectionDate: inspection?.inspectionDate?.toISOString() ?? new Date().toISOString(),
          sentAt: new Date().toISOString(),
          source: 'digital_vehicle_inspection',
        },
      })
      .returning();

    const snapshotRows = itemsToQuote.map((item) => ({
      id: randomUUID(),
      quoteId,
      workspaceId: input.workspaceId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: centsToDecimal(item.lineCents),
    }));

    await tx.insert(quoteItems).values(snapshotRows);

    // 8. Generate Portal URL & Token
    const token = generateQuotePortalToken(input.workspaceId, quoteId, expiresAt);
    const baseUrl = input.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const portalUrl = `${baseUrl.replace(/\/$/, '')}/portal/quotes/${quoteId}?token=${encodeURIComponent(token)}`;

    // 9. Real-Time Customer Email Notification
    const vehicleDesc = vehicle
      ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
      : 'Vehicle';

    const inspectionSummaryItems: InspectionItemSummary[] = inspectionItemRows.map((r) => ({
      name: r.itemName,
      category: r.itemCategory,
      status: r.status as 'good' | 'attention' | 'urgent' | 'not_applicable',
      notes: r.notes,
      recommendedPrice: input.customItemPrices?.[r.id],
    }));

    if (input.sendEmailImmediately !== false && customer.email) {
      await sendInspectionQuoteEmail({
        workspaceId: input.workspaceId,
        quoteId,
        quoteTotal: total,
        quoteSubtotal: subtotal,
        quoteTax: taxTotal,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        customerEmail: customer.email,
        vehicleDescription: vehicleDesc,
        shopName: workspace?.name || 'Service Writer Shop',
        shopPhone: settings?.phone,
        shopEmail: settings?.email,
        inspectionTemplateName: inspection?.templateName || 'Multi-Point Digital Inspection',
        inspectorName: inspection?.inspectorName || 'Lead Technician',
        inspectionDate: inspection?.inspectionDate || new Date(),
        items: inspectionSummaryItems,
        expiresAt,
        appBaseUrl: baseUrl,
      });
    }

    // 10. Publish Domain Events
    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: 'quote.sent',
      payload: {
        quoteId: quote.id,
        workOrderId: workOrder.id,
        inspectionId: inspection?.id ?? null,
        customerId: workOrder.customerId,
        vehicleId: workOrder.vehicleId,
        subtotal,
        taxTotal,
        total,
        itemCount: snapshotRows.length,
        portalUrl,
        customerEmail: customer.email,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    // 11. Complete Idempotency
    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.create_from_inspection',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 201,
      responseBody: { quoteId: quote.id, portalUrl },
      resourceType: 'quote',
      resourceId: quote.id,
    });

    return {
      quote,
      items: snapshotRows,
      portalUrl,
      inspectionSummary: {
        passedCount: inspectionItemRows.filter((i) => i.status === 'good').length,
        attentionCount: inspectionItemRows.filter((i) => i.status === 'attention').length,
        urgentCount: inspectionItemRows.filter((i) => i.status === 'urgent').length,
      },
    };
  });
}
