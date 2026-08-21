export function buildTechnicianFixture(overrides: Record<string, any> = {}) {
  return {
    id: "tech-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    auth_user_id: "00000000-0000-0000-0000-000000000003",
    name: "Dave Miller",
    email: "dave.tech@apexautocare.com",
    phone: "+12155550188",
    status: "active",
    van_id: "van-001",
    van_name: "Mobile Unit 1 - Ford Transit",
    skills: ["Oil Change", "Brakes", "Diagnostics", "Tires"],
    is_clocked_in: true,
    is_active: true,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
