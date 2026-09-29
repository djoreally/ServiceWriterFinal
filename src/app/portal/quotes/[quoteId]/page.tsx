import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  inspectionResults,
  quoteItems,
  quotes,
  serviceInspections,
  vehicles,
  workspaces,
  workspaceSettings,
} from '@/db/schema';
import { verifyQuotePortalToken } from '@/server/auth/portal-token';
import { submitPortalQuoteDecision } from './actions';

export const dynamic = 'force-dynamic';

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(num) ? num : 0);
}

export default async function CustomerQuotePortalPage({
  params,
  searchParams,
}: {
  params: { quoteId: string };
  searchParams?: { token?: string; notice?: string; error?: string };
}) {
  const token = searchParams?.token;
  if (!token) notFound();

  const [quote] = await getDb()
    .select({
      id: quotes.id,
      workspaceId: quotes.workspaceId,
      workOrderId: quotes.workOrderId,
      status: quotes.status,
      subtotal: quotes.subtotal,
      taxTotal: quotes.taxTotal,
      total: quotes.total,
      expiresAt: quotes.expiresAt,
      metadata: quotes.metadata,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      customerFirstName: customers.firstName,
      customerLastName: customers.lastName,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      vehicleYear: vehicles.year,
      vehicleMake: vehicles.make,
      vehicleModel: vehicles.model,
      vehicleVin: vehicles.vin,
      vehiclePlate: vehicles.licensePlate,
      shopName: workspaces.name,
      shopPhone: workspaceSettings.phone,
      shopEmail: workspaceSettings.email,
      shopAddress: workspaceSettings.addressLine1,
      shopCity: workspaceSettings.city,
      shopRegion: workspaceSettings.region,
      termsAndConditions: workspaceSettings.termsAndConditions,
      requireTermsAcceptance: workspaceSettings.requireTermsAcceptance,
    })
    .from(quotes)
    .innerJoin(workspaces, eq(workspaces.id, quotes.workspaceId))
    .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, quotes.workspaceId))
    .innerJoin(customers, and(eq(customers.workspaceId, quotes.workspaceId), eq(customers.id, quotes.customerId)))
    .leftJoin(vehicles, and(eq(vehicles.workspaceId, quotes.workspaceId), eq(vehicles.id, quotes.vehicleId)))
    .where(eq(quotes.id, params.quoteId))
    .limit(1);

  if (!quote || !verifyQuotePortalToken(token, quote.workspaceId, quote.id)) {
    notFound();
  }

  // Fetch Quote Line Items
  const items = await getDb()
    .select()
    .from(quoteItems)
    .where(and(eq(quoteItems.workspaceId, quote.workspaceId), eq(quoteItems.quoteId, quote.id)))
    .orderBy(asc(quoteItems.createdAt));

  // Fetch Inspection Findings if linked
  const inspectionId = (quote.metadata as Record<string, unknown>)?.inspectionId as string | undefined;
  let inspectionRows: Array<{
    id: string;
    itemName: string;
    itemCategory: string | null;
    status: string;
    notes: string | null;
  }> = [];

  let inspectionHeader: {
    templateName: string;
    inspectorName: string | null;
    inspectionDate: Date;
  } | null = null;

  if (inspectionId) {
    const [insp] = await getDb()
      .select({
        templateName: serviceInspections.templateName,
        inspectorName: serviceInspections.inspectorName,
        inspectionDate: serviceInspections.inspectionDate,
      })
      .from(serviceInspections)
      .where(and(eq(serviceInspections.workspaceId, quote.workspaceId), eq(serviceInspections.id, inspectionId)))
      .limit(1);

    if (insp) {
      inspectionHeader = insp;
      inspectionRows = await getDb()
        .select({
          id: inspectionResults.id,
          itemName: inspectionResults.itemName,
          itemCategory: inspectionResults.itemCategory,
          status: inspectionResults.status,
          notes: inspectionResults.notes,
        })
        .from(inspectionResults)
        .where(
          and(
            eq(inspectionResults.workspaceId, quote.workspaceId),
            eq(inspectionResults.inspectionId, inspectionId)
          )
        )
        .orderBy(asc(inspectionResults.sortOrder));
    }
  }

  const isApproved = quote.status === 'approved' || quote.status === 'converted';
  const isDeclined = quote.status === 'declined';
  const isPending = !isApproved && !isDeclined;

  const passedCount = inspectionRows.filter((r) => r.status === 'good').length;
  const attentionCount = inspectionRows.filter((r) => r.status === 'attention').length;
  const urgentCount = inspectionRows.filter((r) => r.status === 'urgent').length;

  return (
    <main className="loginPage" style={{ padding: '32px 16px', background: 'radial-gradient(circle at 50% 10%, #1e1b4b 0%, #090d16 100%)' }}>
      <section className="bookingCard" style={{ maxWidth: 860, margin: '0 auto', padding: 0, overflow: 'hidden' }}>
        
        {/* Brand Header */}
        <div style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', color: '#ffffff', padding: '32px 32px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a5b4fc', marginBottom: 4 }}>
                DIGITAL ESTIMATE & INSPECTION PORTAL
              </div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: '#ffffff' }}>{quote.shopName}</h1>
              <div style={{ fontSize: 13.5, color: '#c7d2fe', marginTop: 4 }}>
                Quote #{quote.id.slice(0, 8)} · Issued for <strong>{quote.customerFirstName} {quote.customerLastName}</strong>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 9999,
                fontSize: 12,
                fontWeight: 800,
                textTransform: 'uppercase',
                background: isApproved ? '#ecfdf5' : isDeclined ? '#fef2f2' : '#eef2ff',
                color: isApproved ? '#059669' : isDeclined ? '#dc2626' : '#4f46e5',
                border: `1px solid ${isApproved ? '#a7f3d0' : isDeclined ? '#fecaca' : '#c7d2fe'}`,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isApproved ? '#059669' : isDeclined ? '#dc2626' : '#6366f1' }} />
                {isApproved ? 'Approved & Authorized' : isDeclined ? 'Declined' : 'Pending Your Approval'}
              </div>
            </div>
          </div>

          {/* Vehicle Snapshot Strip */}
          <div style={{ marginTop: 24, background: 'rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 20, fontSize: 13 }}>
            <div>
              <span style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>Vehicle</span>
              <strong>{[quote.vehicleYear, quote.vehicleMake, quote.vehicleModel].filter(Boolean).join(' ') || 'Customer Vehicle'}</strong>
            </div>
            {quote.vehicleVin ? (
              <div>
                <span style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>VIN</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{quote.vehicleVin}</span>
              </div>
            ) : null}
            {quote.vehiclePlate ? (
              <div>
                <span style={{ color: '#a5b4fc', fontSize: 11, fontWeight: 700, display: 'block', textTransform: 'uppercase' }}>License Plate</span>
                <span style={{ fontWeight: 700 }}>{quote.vehiclePlate}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ padding: '28px 32px' }}>
          {searchParams?.notice ? (
            <div className="noticeBox">✓ {searchParams.notice}</div>
          ) : null}
          {searchParams?.error ? (
            <div className="errorBox">⚠ {searchParams.error}</div>
          ) : null}

          {/* If Approved Banner */}
          {isApproved ? (
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 14, padding: '20px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#059669', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
                ✓
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#065f46', fontSize: 17, fontWeight: 800 }}>Repairs Authorized & Done!</h3>
                <p style={{ margin: '3px 0 0', color: '#047857', fontSize: 13.5 }}>
                  Your authorization has been confirmed. The shop floor has transitioned this work order to active service. We will notify you when your vehicle is ready for pickup.
                </p>
              </div>
            </div>
          ) : null}

          {/* Digital Inspection Findings Section (DVI) */}
          {inspectionRows.length > 0 ? (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
                    🔍 Digital Vehicle Inspection (DVI) Findings
                  </h2>
                  <p className="subtle" style={{ margin: '2px 0 0' }}>
                    {inspectionHeader?.templateName || 'Multi-Point Inspection'} · Inspected by {inspectionHeader?.inspectorName || 'Technician'}
                  </p>
                </div>
              </div>

              {/* Scorecard HUD */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{passedCount}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Passed Safety Check</div>
                </div>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{attentionCount}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>Suggested Services</div>
                </div>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{urgentCount}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>Urgent Attention</div>
                </div>
              </div>

              {/* Inspection Items List */}
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Inspected Component</th>
                        <th>Condition Result</th>
                        <th>Technician Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspectionRows.map((r) => {
                        const isGood = r.status === 'good';
                        const isAttention = r.status === 'attention';
                        const isUrgent = r.status === 'urgent';
                        return (
                          <tr key={r.id}>
                            <td><strong>{r.itemName}</strong></td>
                            <td>
                              <span
                                className="badge"
                                style={{
                                  background: isGood ? '#ecfdf5' : isAttention ? '#fffbeb' : isUrgent ? '#fef2f2' : '#f1f5f9',
                                  color: isGood ? '#059669' : isAttention ? '#d97706' : isUrgent ? '#dc2626' : '#64748b',
                                  border: `1px solid ${isGood ? '#a7f3d0' : isAttention ? '#fde68a' : isUrgent ? '#fecaca' : '#cbd5e1'}`,
                                }}
                              >
                                {isGood ? '● Pass' : isAttention ? '▲ Attention' : isUrgent ? '✖ Urgent' : 'N/A'}
                              </span>
                            </td>
                            <td style={{ color: '#475569', fontSize: 13 }}>
                              {r.notes || <span style={{ color: '#94a3b8' }}>Standard condition verified</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}

          {/* Itemized Estimate Section */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 800 }}>
              📋 Itemized Estimate & Proposed Work
            </h2>
            <div className="card tableCard">
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Service / Part Description</th>
                      <th style={{ textAlign: 'center' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Unit Rate</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.description}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <strong>{formatCurrency(item.totalPrice)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
            <div style={{ minWidth: 260, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 6 }}>
                <span>Subtotal:</span>
                <span>{formatCurrency(quote.subtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: '#64748b', marginBottom: 8 }}>
                <span>Taxes & Shop Supplies:</span>
                <span>{formatCurrency(quote.taxTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 800, color: '#0f172a', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                <span>Grand Total:</span>
                <span style={{ color: '#4f46e5' }}>{formatCurrency(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* Shop Terms & Conditions */}
          {quote.termsAndConditions ? (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 16, borderRadius: 12, fontSize: 13, marginBottom: 24 }}>
              <strong style={{ color: '#0f172a' }}>Shop Terms & Authorization Agreement:</strong>
              <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line', color: '#475569', fontSize: 12.5, lineHeight: 1.6 }}>
                {quote.termsAndConditions}
              </p>
            </div>
          ) : null}

          {/* Interactive Approval Controls */}
          {isPending ? (
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800 }}>Authorize Digital Estimate</h3>
              <p style={{ margin: '0 0 18px', fontSize: 13.5, color: '#64748b' }}>
                By approving, you authorize <strong>{quote.shopName}</strong> to perform the specified services on your vehicle.
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <form action={submitPortalQuoteDecision.bind(null, quote.id, token, 'approved')}>
                  <button
                    className="primaryButton"
                    style={{ background: '#059669', fontSize: 15, padding: '14px 20px' }}
                    type="submit"
                  >
                    ✓ Authorize & Approve ({formatCurrency(quote.total)})
                  </button>
                </form>

                <form action={submitPortalQuoteDecision.bind(null, quote.id, token, 'declined')}>
                  <button
                    className="primaryButton"
                    style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca', boxShadow: 'none' }}
                    type="submit"
                  >
                    ✕ Decline Estimate
                  </button>
                </form>
              </div>
            </div>
          ) : null}

          {/* Shop Contact Footer */}
          <div style={{ marginTop: 32, borderTop: '1px solid #e2e8f0', paddingTop: 20, textAlign: 'center', fontSize: 12.5, color: '#64748b' }}>
            <strong>{quote.shopName}</strong>
            {quote.shopAddress ? ` · ${quote.shopAddress}` : ''}
            {quote.shopPhone ? ` · Tel: ${quote.shopPhone}` : ''}
            {quote.shopEmail ? ` · Email: ${quote.shopEmail}` : ''}
          </div>

        </div>
      </section>
    </main>
  );
}
