export function buildAppointmentFixture(overrides: Record<string, any> = {}) {
  return {
    id: "appt-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    title: "Full Synthetic Oil Change",
    guest_name: "Jane Doe",
    guest_email: "jane.doe@example.com",
    guest_phone: "+12155550144",
    scheduled_date: new Date().toISOString().split("T")[0],
    scheduled_time: "10:00",
    duration_minutes: 45,
    status: "confirmed",
    estimated_cost: 89.99,
    tax_amount: 5.40,
    service_catalog_id: "svc-oil-change",
    assigned_technician_id: "tech-001",
    location_address: "500 Market St, Philadelphia, PA 19106",
    notes: "Customer prefers morning service.",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
