import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import {
  customers,
  quotes,
  serviceInspections,
  vehicles,
  workOrders,
} from '@/db/schema';
import { getWorkOrderInspectionPlan } from '@/server/application/inspections/complete-inspection';
import { generateQuotePortalToken } from '@/server/auth/portal-token';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import {
  createQuoteFromInspectionAction,
  submitInspectionAction,
} from '../../../step4-actions';

const JOB_ROLES = new Set(['owner', 'admin', 'manager', 'service_advisor', 'technician']);
export const dynamic = 'force-dynamic';

function formatCurrency(amount: string | number) {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(num) ? num : 0);
}

export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: { workspaceId: string; workOrderId: string };
  searchParams?: { notice?: string; error?: string };
}) {
  const user = await requirePageUser();
  const { workspace } = await requirePageWorkspace(user.id, params.workspaceId);
  const plan = await getWorkOrderInspectionPlan(params.workspaceId, params.workOrderId);
  if (!plan) {
    return (
      <main className="content">
        <div className="errorBox">Work order not found.</div>
      </main>
    );
  }

  const canInspect = JOB_ROLES.has(workspace.role);

  // Fetch linked quotes for this work order to display approval status HUD
  const linkedQuotes = await getDb()
    .select({
      id: quotes.id,
      status: quotes.status,
      total: quotes.total,
      subtotal: quotes.subtotal,
      taxTotal: quotes.taxTotal,
      createdAt: quotes.createdAt,
      expiresAt: quotes.expiresAt,
      metadata: quotes.metadata,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.workspaceId, params.workspaceId),
        eq(quotes.workOrderId, params.workOrderId)
      )
    )
    .orderBy(desc(quotes.createdAt));

  const latestQuote = linkedQuotes[0];
  let latestPortalUrl: string | null = null;
  if (latestQuote) {
    const expiresAt = latestQuote.expiresAt || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const token = generateQuotePortalToken(params.workspaceId, latestQuote.id, expiresAt);
    latestPortalUrl = `/portal/quotes/${latestQuote.id}?token=${encodeURIComponent(token)}`;
  }

  return (
    <main className="content">
      {/* Top Breadcrumb & Page Header */}
      <div className="pageHeader" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <Link href={`/dashboard/${params.workspaceId}/work-orders`} className="userMeta" style={{ fontWeight: 700 }}>
              ← Back to Work Orders
            </Link>
          </div>
          <h1>Digital Vehicle Inspection (DVI)</h1>
          <p>
            Work Order #{plan.id.slice(0, 8)} · Multi-point vehicle safety & maintenance review
          </p>
        </div>

        {latestQuote ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 18px', textAlign: 'right' }}>
            <div className="kicker">Customer Quote Status</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
              <span className={`badge ${latestQuote.status}`}>
                {latestQuote.status.replace(/_/g, ' ')}
              </span>
              <strong style={{ fontSize: 16 }}>{formatCurrency(latestQuote.total)}</strong>
            </div>
            {latestPortalUrl ? (
              <div style={{ marginTop: 6 }}>
                <a
                  href={latestPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="subtle"
                  style={{ color: '#4f46e5', fontWeight: 700 }}
                >
                  🔗 Open Customer Portal View →
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {searchParams?.notice ? <div className="noticeBox">✓ {searchParams.notice}</div> : null}
      {searchParams?.error ? <div className="errorBox">⚠ {searchParams.error}</div> : null}

      {/* If an inspection was completed and no quote exists yet, offer direct quote generation */}
      {plan.plans.some((p) => p.completed) && !latestQuote && canInspect ? (
        <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 14, padding: '18px 22px', marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <strong style={{ color: '#312e81', fontSize: 15 }}>Digital Inspection Completed!</strong>
            <p style={{ margin: '3px 0 0', color: '#4338ca', fontSize: 13.5 }}>
              Convert findings into an authorized customer quote and immediately dispatch email to the customer.
            </p>
          </div>
          <form action={createQuoteFromInspectionAction.bind(null, params.workspaceId, params.workOrderId)}>
            <button className="primaryButton" style={{ background: '#4f46e5', width: 'auto', padding: '10px 20px' }} type="submit">
              ⚡ Generate Quote & Email Customer
            </button>
          </form>
        </div>
      ) : null}

      {plan.plans.length === 0 ? (
        <section className="card">
          <h2>No inspection required</h2>
          <p className="subtle">None of this work order’s services require an inspection template.</p>
        </section>
      ) : null}

      {/* Inspection Checklist Plans */}
      <section className="stack">
        {plan.plans.map((template) => (
          <article className="card" key={template.templateId} style={{ padding: 24 }}>
            <div className="rowBetween" style={{ marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <div>
                <div className="kicker">{template.serviceName}</div>
                <h2 style={{ margin: '4px 0 0', fontSize: 18 }}>{template.templateName}</h2>
              </div>
              <div>
                {template.completed ? (
                  <span className="badge confirmed" style={{ fontSize: 12, padding: '6px 12px' }}>
                    ✓ Inspection Completed
                  </span>
                ) : (
                  <span className="badge requested" style={{ fontSize: 12, padding: '6px 12px' }}>
                    ● Pending Technician Review
                  </span>
                )}
              </div>
            </div>

            {!template.completed && canInspect ? (
              <form action={submitInspectionAction.bind(null, params.workspaceId, params.workOrderId, template.templateId)}>
                <div className="inspectionList">
                  {template.items.map((item) => (
                    <div className="inspectionItem" key={item.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(160px, .7fr) minmax(180px, 1.2fr)', gap: 12, padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid var(--border)' }}>
                      <div>
                        <strong>{item.name}</strong>
                        {item.description ? <div className="subtle">{item.description}</div> : null}
                        {item.isRequired ? <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>* Required</div> : null}
                      </div>

                      <select name={'status:' + item.id} required={item.isRequired} defaultValue="">
                        <option value="">Select condition...</option>
                        <option value="good">🟢 Pass / Good</option>
                        <option value="attention">🟡 Needs Attention</option>
                        <option value="urgent">🔴 Urgent Fail / Safety</option>
                        <option value="not_applicable">⚪ N/A</option>
                      </select>

                      <input name={'notes:' + item.id} placeholder="Technician diagnosis & findings..." />
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 20 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
                    Technician Summary Notes
                    <textarea name="inspectionNotes" rows={3} placeholder="Overall vehicle diagnosis, recommendations, and road test notes..." />
                  </label>
                </div>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer', fontWeight: 600 }}>
                    <input type="checkbox" name="generateQuote" value="true" defaultChecked style={{ width: 18, height: 18 }} />
                    <span>⚡ Immediately generate customer quote & dispatch real-time email</span>
                  </label>

                  <div className="formActions" style={{ margin: 0 }}>
                    <button className="primaryInline" type="submit" style={{ padding: '12px 24px', fontSize: 14 }}>
                      Submit Inspection Checklist →
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
