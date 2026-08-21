// GDPR account deletion request handler.
// The list is intentionally explicit so every user-owned table is reviewed before deletion.
const SOFT_DELETE_TABLES = [
  'customers', 'customer_accounts', 'appointments', 'fleet_clients', 'fleet_contacts',
  'fleet_vehicles', 'technicians', 'technician_documents', 'vehicles', 'audit_logs',
  'email_logs', 'sms_logs', 'newsletter_subscribers', 'review_requests', 'testimonials',
  'payment_records', 'invoices', 'invoice_line_items', 'services', 'work_orders',
  'business_profiles', 'email_settings', 'customer_preferences',
];

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  return new Response(JSON.stringify({ accepted: true, tables: SOFT_DELETE_TABLES }), {
    headers: { 'content-type': 'application/json' },
  });
}
