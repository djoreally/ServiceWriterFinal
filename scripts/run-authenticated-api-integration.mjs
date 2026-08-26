import fs from 'node:fs/promises';

const baseUrl = (process.env.E2E_BASE_URL || 'https://service-writer-final.vercel.app').replace(/\/$/, '');
const workspaceId = process.env.E2E_WORKSPACE_ID || 'd0000000-0000-4000-8000-000000000001';
const tokenPath = process.env.E2E_ACCESS_TOKEN_FILE || 'tmp/demo_access_token.txt';
const token = (await fs.readFile(tokenPath, 'utf8')).trim();
if (!token) throw new Error('Missing access token');

const headers = { Authorization: `Bearer ${token}` };
const checks = [
  ['workspaces', `/api/v1/workspaces?limit=25&offset=0`],
  ['identity', `/api/v1/identity`],
  ['customers', `/api/v1/customers?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['vehicles', `/api/v1/vehicles?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['appointments', `/api/v1/appointments?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['work-orders', `/api/v1/work-orders?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['service-catalog', `/api/v1/service-catalog?workspace_id=${workspaceId}`],
  ['invoices', `/api/v1/invoices?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['payments', `/api/v1/payments?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['dispatch-events', `/api/v1/dispatch-events?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['appointment-items', `/api/v1/appointment-items?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['service-records', `/api/v1/service-records?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['invitations', `/api/v1/invitations?workspace_id=${workspaceId}&limit=5&offset=0`],
  ['imports', `/api/v1/imports?workspace_id=${workspaceId}&limit=5&offset=0`],
];

const rows = [];
for (const [name, path] of checks) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${path}`, { headers });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  const count = Array.isArray(body?.data) ? body.data.length : null;
  rows.push({ name, method: 'GET', status: response.status, ok: response.ok, count, ms: Date.now() - started, error: body?.error?.message || null });
}

const failures = rows.filter((r) => !r.ok);
console.table(rows);
console.log(JSON.stringify({ baseUrl, workspaceId, total: rows.length, passed: rows.length - failures.length, failed: failures.length, rows }, null, 2));
if (failures.length) process.exitCode = 1;
