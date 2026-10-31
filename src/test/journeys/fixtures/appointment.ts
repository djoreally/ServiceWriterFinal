import { composeAppointmentTitleFields } from "@/lib/appointment-title";

export function buildAppointmentFixture(overrides: Record<string, any> = {}) {
  const scheduledDate = new Date().toISOString().split("T")[0];
  const row: Record<string, any> = {
    id: "appt-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    title: "Full Synthetic Oil Change",
    guest_name: "Jane Doe",
    guest_email: "jane.doe@example.com",
    guest_phone: "+12155550144",
    scheduled_date: scheduledDate,
    scheduled_time: "10:00",
    duration_minutes: 45,
    starts_at: `${scheduledDate}T10:00:00.000Z`,
    ends_at: `${scheduledDate}T10:45:00.000Z`,
    source: "manual",
    customer_id: null,
    vehicle_id: null,
    assigned_user_id: "tech-001",
    metadata: {
      title: "Full Synthetic Oil Change",
      guest_name: "Jane Doe",
      guest_email: "jane.doe@example.com",
      guest_phone: "+12155550144",
      estimated_cost: 89.99,
    },
    status: "confirmed",
    estimated_cost: 89.99,
    tax_amount: 5.40,
    service_catalog_id: "svc-oil-change",
    assigned_technician_id: "tech-001",
    location_address: "500 Market St, Philadelphia, PA 19106",
    notes: "Customer prefers morning service.",
    created_at: new Date().toISOString(),
  };
  // B2 (redesign truth T-1): the API composes display_title /
  // primary_service_name / confirmation_code server-side, and the journey
  // mock returns table rows as API rows — so the fixture carries the fields
  // exactly as the real composition produces them for this row (workspace
  // timezone America/New_York, per the workspace-context mock). Stored
  // titles above stay in the row: the composition must ignore them.
  const composed = composeAppointmentTitleFields(
    { ...row, ...overrides },
    { timezone: "America/New_York" },
  );
  return {
    ...row,
    display_title: composed.display_title,
    primary_service_name: composed.primary_service_name,
    confirmation_code: composed.confirmation_code,
    ...overrides,
  };
}
