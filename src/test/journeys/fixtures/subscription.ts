export function buildSubscriptionFixture(overrides: Record<string, any> = {}) {
  return {
    id: "sub-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    plan_tier: "growth",
    status: "active",
    trial_ends_at: null,
    current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
    has_marketing_automation: true,
    has_invoicing_full: true,
    has_fleet_module: true,
    max_technicians: 5,
    ...overrides,
  };
}
