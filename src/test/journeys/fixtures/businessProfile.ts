export function buildBusinessProfileFixture(overrides: Record<string, any> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    user_id: "00000000-0000-0000-0000-000000000001",
    business_name: "Apex Mobile Auto Care",
    business_slug: "apex-auto",
    phone: "+12155550199",
    email: "owner@apexautocare.com",
    address: "100 Main St, Philadelphia, PA 19106",
    service_radius_miles: 25,
    business_hours: {
      monday: { open: "08:00", close: "18:00", active: true },
      tuesday: { open: "08:00", close: "18:00", active: true },
      wednesday: { open: "08:00", close: "18:00", active: true },
      thursday: { open: "08:00", close: "18:00", active: true },
      friday: { open: "08:00", close: "18:00", active: true },
      saturday: { open: "09:00", close: "15:00", active: true },
      sunday: { open: "00:00", close: "00:00", active: false },
    },
    auto_approve_appointments: true,
    has_onboarded: true,
    stripe_account_id: "acct_test_123",
    stripe_charges_enabled: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
