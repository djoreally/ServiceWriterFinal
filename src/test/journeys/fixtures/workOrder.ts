export function buildWorkOrderFixture(overrides: Record<string, any> = {}) {
  return {
    id: "wo-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    fleet_client_id: "fleet-client-101",
    work_order_number: "WO-2026-0001",
    status: "in_progress",
    po_authorization_status: "approved",
    po_number: "PO-99482",
    po_amount_limit: 1500.00,
    subtotal: 350.00,
    tax_total: 21.00,
    grand_total: 371.00,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
