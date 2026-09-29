import Link from 'next/link';
import { requirePageUser, requirePageWorkspace } from '@/server/auth/page-session';
import { listAppointments } from '@/server/repositories/appointments.repository';
import { listWorkOrdersDetailed, listQuotesDetailed, listInvoicesDetailed, listPaymentsDetailed, getStripeConnection } from '@/server/repositories/billing.repository';
import { listCustomers } from '@/server/repositories/customers.repository';
import { listVehicles } from '@/server/repositories/vehicles.repository';
import { listServices } from '@/server/repositories/services.repository';
import { getWorkspaceSettingsView } from '@/server/settings/workspace-settings';

export const dynamic = 'force-dynamic';

function formatCurrency(amount: number | string, currency = 'USD') {
  const num = typeof amount === 'string' ? Number(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(num) ? num : 0);
}

function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: { workspaceId: string };
}) {
  const user = await requirePageUser();
  const { workspace } = await requirePageWorkspace(user.id, params.workspaceId);

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const futureWindow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    appointments,
    workOrders,
    quotes,
    invoices,
    payments,
    customers,
    vehicles,
    services,
    settings,
    stripeConn,
  ] = await Promise.all([
    listAppointments(params.workspaceId, { from: startOfDay, to: futureWindow, limit: 10, offset: 0 }),
    listWorkOrdersDetailed(params.workspaceId, { limit: 10, offset: 0 }),
    listQuotesDetailed(params.workspaceId, { limit: 10, offset: 0 }),
    listInvoicesDetailed(params.workspaceId, { limit: 10, offset: 0 }),
    listPaymentsDetailed(params.workspaceId, { limit: 10, offset: 0 }),
    listCustomers(params.workspaceId, { limit: 100, offset: 0 }),
    listVehicles(params.workspaceId, { limit: 100, offset: 0 }),
    listServices(params.workspaceId, { activeOnly: true, limit: 100, offset: 0 }),
    getWorkspaceSettingsView(params.workspaceId),
    getStripeConnection(params.workspaceId),
  ]);

  const currency = settings?.currencyCode || 'USD';
  const tz = workspace.timezone || 'UTC';

  // KPI Calculations
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const outstandingAR = invoices.reduce((sum, inv) => {
    if (inv.status === 'void' || inv.status === 'paid') return sum;
    const bal = Math.max(0, Number(inv.total || 0) - Number(inv.amountPaid || 0));
    return sum + bal;
  }, 0);

  const inProgressJobs = workOrders.filter((w) => w.status === 'in_progress').length;
  const activeOrders = workOrders.filter((w) => !['completed', 'cancelled'].includes(w.status)).length;
  const pendingQuotes = quotes.filter((q) => q.status === 'sent' || q.status === 'draft').length;
  const approvedQuotes = quotes.filter((q) => q.status === 'approved').length;

  const todayDateString = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  const base = `/dashboard/${workspace.id}`;

  return (
    <main className="content">
      {/* Cockpit Command Center Header */}
      <section className="cockpitHeader">
        <div className="cockpitTitle">
          <div className="kicker" style={{ color: '#6366f1' }}>
            Shop Command Center · {todayDateString}
          </div>
          <h1>{workspace.name}</h1>
          <p className="userMeta" style={{ margin: '4px 0 0' }}>
            Logged in as <strong>{user.email}</strong> · Role: <span style={{ textTransform: 'capitalize' }}>{workspace.role.replaceAll('_', ' ')}</span>
          </p>
        </div>

        <div className="quickActionsBar">
          <Link href={`${base}/appointments`} className="actionBtn primary">
            + New Appointment
          </Link>
          <Link href={`${base}/work-orders`} className="actionBtn">
            + New Work Order
          </Link>
          <Link href={`${base}/customers`} className="actionBtn">
            + Customer
          </Link>
          <Link href={`${base}/services`} className="actionBtn">
            Catalog
          </Link>
          {settings?.bookingSlug ? (
            <a
              href={`/book/${settings.bookingSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="actionBtn"
              style={{ borderColor: '#6366f1', color: '#4f46e5' }}
            >
              🌐 Online Booking
            </a>
          ) : null}
        </div>
      </section>

      {/* Primary KPI Metrics */}
      <section className="kpiGrid">
        <article className="kpiCard success">
          <div className="kicker">Total Collected</div>
          <div className="kpiValue" style={{ color: '#027a48' }}>
            {formatCurrency(totalRevenue, currency)}
          </div>
          <div className="kpiSub">From {payments.length} settled payment{payments.length === 1 ? '' : 's'}</div>
        </article>

        <article className="kpiCard accent">
          <div className="kicker">Upcoming Schedule</div>
          <div className="kpiValue">{appointments.length}</div>
          <div className="kpiSub">Appointments in next 30 days</div>
        </article>

        <article className="kpiCard accent">
          <div className="kicker">Shop Floor Activity</div>
          <div className="kpiValue">{activeOrders}</div>
          <div className="kpiSub">
            <strong>{inProgressJobs}</strong> currently in-progress
          </div>
        </article>

        <article className="kpiCard warning">
          <div className="kicker">Outstanding A/R</div>
          <div className="kpiValue" style={{ color: '#b54708' }}>
            {formatCurrency(outstandingAR, currency)}
          </div>
          <div className="kpiSub">Pending invoice settlement</div>
        </article>
      </section>

      {/* Secondary Quick Vitals */}
      <section className="grid" style={{ marginBottom: 20 }}>
        <article className="card" style={{ padding: '14px 18px' }}>
          <div className="kicker">Quotes Ready</div>
          <div className="metric" style={{ fontSize: 24, margin: '4px 0 2px' }}>
            {pendingQuotes} pending / {approvedQuotes} approved
          </div>
          <div className="subtle"><Link href={`${base}/quotes`}>View Quotes & Approvals →</Link></div>
        </article>

        <article className="card" style={{ padding: '14px 18px' }}>
          <div className="kicker">Customer Base</div>
          <div className="metric" style={{ fontSize: 24, margin: '4px 0 2px' }}>
            {customers.length} Customers · {vehicles.length} Vehicles
          </div>
          <div className="subtle"><Link href={`${base}/customers`}>View Directory →</Link></div>
        </article>

        <article className="card" style={{ padding: '14px 18px' }}>
          <div className="kicker">Stripe Terminal / Connect</div>
          <div className="metric" style={{ fontSize: 24, margin: '4px 0 2px' }}>
            {stripeConn?.status === 'connected' ? (
              <span style={{ color: '#027a48' }}>● Active</span>
            ) : (
              <span style={{ color: '#b54708', fontSize: 18 }}>Not Connected</span>
            )}
          </div>
          <div className="subtle"><Link href={`${base}/settings`}>Configure Provider →</Link></div>
        </article>
      </section>

      {/* Split Operational Feeds */}
      <section className="dashboardSplit">
        {/* Left Column: Upcoming Appointments & Schedule */}
        <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Upcoming Appointments</h2>
            <Link href={`${base}/appointments`} className="userMeta" style={{ fontWeight: 700 }}>
              View all →
            </Link>
          </div>

          <div>
            {appointments.length === 0 ? (
              <div className="emptyState">No upcoming appointments scheduled.</div>
            ) : (
              appointments.slice(0, 6).map((apt) => (
                <div key={apt.id} className="feedItem">
                  <div className="feedTime">
                    <div>{formatDate(apt.startsAt, tz)}</div>
                    <div className="subtle">{formatTime(apt.startsAt, tz)}</div>
                  </div>
                  <div className="feedMain">
                    <div className="feedTitle">
                      {apt.customerFirstName} {apt.customerLastName}
                    </div>
                    <div className="feedMeta">
                      {[apt.vehicleYear, apt.vehicleMake, apt.vehicleModel].filter(Boolean).join(' ') || 'No vehicle'}
                      {apt.notes ? ` · "${apt.notes.slice(0, 40)}..."` : ''}
                    </div>
                  </div>
                  <div>
                    <span className={`badge ${apt.status}`}>{apt.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {/* Right Column: Active Jobs & Shop Floor */}
        <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Shop Floor & Active Jobs</h2>
            <Link href={`${base}/work-orders`} className="userMeta" style={{ fontWeight: 700 }}>
              Work orders →
            </Link>
          </div>

          <div>
            {workOrders.length === 0 ? (
              <div className="emptyState">No work orders recorded.</div>
            ) : (
              workOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="feedItem">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <strong>#{order.number}</strong>
                      <span className="feedTitle">{order.customerFirstName} {order.customerLastName}</span>
                      <span className={`priorityBadge ${order.priority}`}>{order.priority}</span>
                    </div>
                    <div className="feedMeta">
                      {[order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ') || 'No vehicle'}
                      {order.complaint ? ` · ${order.complaint.slice(0, 35)}...` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>${Number(order.lineTotal || 0).toFixed(2)}</div>
                    <span className={`badge ${order.status}`} style={{ marginTop: 3 }}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      {/* Financial & Invoicing Summary Section */}
      <section className="card tableCard">
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16 }}>Recent Invoices & Balances</h2>
            <p className="subtle" style={{ margin: '3px 0 0' }}>Track billing progress and card settlements</p>
          </div>
          <Link href={`${base}/invoices`} className="userMeta" style={{ fontWeight: 700 }}>
            All Invoices →
          </Link>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Issued</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="emptyState">No invoices issued yet.</td>
                </tr>
              ) : (
                invoices.slice(0, 5).map((inv) => {
                  const bal = Math.max(0, Number(inv.total || 0) - Number(inv.amountPaid || 0));
                  return (
                    <tr key={inv.id}>
                      <td><strong>#{inv.invoiceNumber}</strong></td>
                      <td>
                        {inv.customerFirstName} {inv.customerLastName}
                        <div className="subtle">{[inv.vehicleYear, inv.vehicleMake, inv.vehicleModel].filter(Boolean).join(' ')}</div>
                      </td>
                      <td>{inv.issuedAt ? formatDate(inv.issuedAt, tz) : 'Draft'}</td>
                      <td>${Number(inv.total).toFixed(2)}</td>
                      <td>${Number(inv.amountPaid).toFixed(2)}</td>
                      <td><strong>${bal.toFixed(2)}</strong></td>
                      <td><span className={`badge ${inv.status}`}>{inv.status.replace(/_/g, ' ')}</span></td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
