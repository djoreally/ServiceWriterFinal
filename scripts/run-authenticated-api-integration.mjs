import fs from 'node:fs/promises';

const baseUrl = (process.env.E2E_BASE_URL || 'https://service-writer-final.vercel.app').replace(/\/$/, '');
const workspaceId = process.env.E2E_WORKSPACE_ID || 'd0000000-0000-4000-8000-000000000001';
const tokenPath = process.env.E2E_ACCESS_TOKEN_FILE || 'tmp/demo_access_token.txt';
const token = (await fs.readFile(tokenPath, 'utf8')).trim();
if (!token) throw new Error('Missing access token');
const headers = { Authorization: `Bearer ${token}` };
const rows = [];
const bodies = new Map();

async function check(name, path) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  const row = { name, method: 'GET', status: response.status, ok: response.ok, count: Array.isArray(body?.data) ? body.data.length : null, ms: Date.now() - started, error: body?.error?.message || null };
  rows.push(row);
  bodies.set(name, body);
  return body;
}

const core = {};
core.workspaces = await check('workspaces', `/api/v1/workspaces?limit=25&offset=0`);
await check('identity', `/api/v1/identity`);
core.customers = await check('customers', `/api/v1/customers?workspace_id=${workspaceId}&limit=5&offset=0`);
core.vehicles = await check('vehicles', `/api/v1/vehicles?workspace_id=${workspaceId}&limit=5&offset=0`);
core.appointments = await check('appointments', `/api/v1/appointments?workspace_id=${workspaceId}&limit=5&offset=0`);
core.workOrders = await check('work-orders', `/api/v1/work-orders?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('service-catalog', `/api/v1/service-catalog?workspace_id=${workspaceId}`);
core.invoices = await check('invoices', `/api/v1/invoices?workspace_id=${workspaceId}&limit=5&offset=0`);
core.payments = await check('payments', `/api/v1/payments?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('dispatch-events', `/api/v1/dispatch-events?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('appointment-items', `/api/v1/appointment-items?workspace_id=${workspaceId}&limit=5&offset=0`);
core.serviceRecords = await check('service-records', `/api/v1/service-records?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('invitations', `/api/v1/invitations?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('imports', `/api/v1/imports?workspace_id=${workspaceId}&limit=5&offset=0`);

await check('crm-access', `/api/v1/crm/access?workspace_id=${workspaceId}`);
await check('crm-activities', `/api/v1/crm/activities?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('crm-campaigns', `/api/v1/crm/campaigns?workspace_id=${workspaceId}&limit=5&offset=0`);
await check('crm-profiles', `/api/v1/crm/profiles?workspace_id=${workspaceId}&limit=5&offset=0`);

const first = (body) => Array.isArray(body?.data) ? body.data[0] : null;
const ids = {
  customer: first(core.customers)?.id,
  vehicle: first(core.vehicles)?.id,
  appointment: first(core.appointments)?.id,
  workOrder: first(core.workOrders)?.id,
  invoice: first(core.invoices)?.id,
  payment: first(core.payments)?.id,
  serviceRecord: first(core.serviceRecords)?.id,
};

const detailChecks = [
  ['customer-detail', ids.customer && `/api/v1/customers/${ids.customer}?workspace_id=${workspaceId}`],
  ['customer-summary', ids.customer && `/api/v1/customers/${ids.customer}/summary?workspace_id=${workspaceId}`],
  ['vehicle-detail', ids.vehicle && `/api/v1/vehicles/${ids.vehicle}?workspace_id=${workspaceId}`],
  ['vehicle-summary', ids.vehicle && `/api/v1/vehicles/${ids.vehicle}/summary?workspace_id=${workspaceId}`],
  ['appointment-detail', ids.appointment && `/api/v1/appointments/${ids.appointment}?workspace_id=${workspaceId}`],
  ['work-order-detail', ids.workOrder && `/api/v1/work-orders/${ids.workOrder}?workspace_id=${workspaceId}`],
  ['invoice-detail', ids.invoice && `/api/v1/invoices/${ids.invoice}?workspace_id=${workspaceId}`],
  ['payment-detail', ids.payment && `/api/v1/payments/${ids.payment}?workspace_id=${workspaceId}`],
  ['service-record-detail', ids.serviceRecord && `/api/v1/service-records/${ids.serviceRecord}?workspace_id=${workspaceId}`],
];
for (const [name, path] of detailChecks) {
  if (path) await check(name, path);
}

const failures = rows.filter((r) => !r.ok);
console.table(rows);
console.log(JSON.stringify({ baseUrl, workspaceId, total: rows.length, passed: rows.length - failures.length, failed: failures.length, ids, rows }, null, 2));
if (failures.length) process.exitCode = 1;
