export function buildInventoryItemFixture(overrides: Record<string, any> = {}) {
  return {
    id: "inv-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    van_id: "van-001",
    name: "5W-30 Full Synthetic Oil (Quart)",
    sku: "OIL-5W30-QT",
    quantity: 48,
    unit_cost: 4.50,
    retail_price: 9.99,
    reorder_threshold: 12,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
