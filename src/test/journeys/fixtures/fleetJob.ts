export function buildFleetJobFixture(overrides: Record<string, any> = {}) {
  return {
    id: "fleet-job-001",
    user_id: "00000000-0000-0000-0000-000000000001",
    fleet_client_id: "fleet-client-101",
    client_name: "Metro Logistics LLC",
    vehicle_id: "veh-fleet-101",
    vin: "1FTFW1ED4MFC12345",
    vehicle_name: "2021 Ford F-150 SuperCrew",
    assigned_tech_id: "tech-001",
    status: "dispatched",
    scheduled_start: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}
