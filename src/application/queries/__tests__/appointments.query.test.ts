jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1", userId: "user-1" })),
  fetchBusinessSettings: jest.fn(async () => null),
}));

jest.mock("@/lib/nextApiClient", () => ({
  nextApi: {
    appointments: { list: jest.fn() },
    customers: { list: jest.fn() },
    vehicles: { list: jest.fn() },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { fetchAppointmentsPageData } from "@/application/queries/appointments.query";

function makeBuilder(result: { data: any; error: any }) {
  const builder: any = {
    select: jest.fn(() => builder),
    neq: jest.fn(() => Promise.resolve(result)),
    eq: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  return builder;
}

describe("fetchAppointmentsPageData retail boundary", () => {
  const mockGetUser = supabase.auth.getUser as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("excludes fleet_work_order source rows from retail appointments query", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    (nextApi.appointments.list as jest.Mock).mockResolvedValue({
      data: [
        { id: "a1", source: "manual", starts_at: "2026-08-25T09:00:00.000Z", ends_at: "2026-08-25T10:00:00.000Z", status: "confirmed", customer_id: null, vehicle_id: null, metadata: null },
        { id: "a2", source: "fleet_work_order", starts_at: "2026-08-25T10:00:00.000Z", ends_at: "2026-08-25T11:00:00.000Z", status: "confirmed", customer_id: null, vehicle_id: null, metadata: null },
        { id: "a3", source: "manual", starts_at: "2026-08-25T11:00:00.000Z", ends_at: "2026-08-25T12:00:00.000Z", status: "confirmed", customer_id: null, vehicle_id: null, metadata: { fleet_work_order_id: "wo-123" } },
      ],
    });
    (nextApi.customers.list as jest.Mock).mockResolvedValue({ data: [] });
    (nextApi.vehicles.list as jest.Mock).mockResolvedValue({ data: [] });

    const appointmentsBuilder = makeBuilder({
      data: [
        { id: "a1", source: "manual", intake_responses: null },
        { id: "a2", source: "fleet_work_order", intake_responses: null },
        { id: "a3", source: "manual", intake_responses: { fleet_work_order_id: "wo-123" } },
      ],
      error: null,
    });
    const catalogBuilder: any = {
      select: jest.fn(() => catalogBuilder),
      eq: jest.fn(() => catalogBuilder),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const vansBuilder: any = {
      select: jest.fn(() => vansBuilder),
      eq: jest.fn(() => vansBuilder),
      order: jest.fn(() => Promise.resolve({ data: [], error: null })),
    };
    const profileBuilder = {
      select: jest.fn(() => ({
        maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "appointments") return appointmentsBuilder;
      if (table === "service_catalog") return catalogBuilder;
      if (table === "vans") return vansBuilder;
      if (table === "business_profiles") return profileBuilder;
      return { select: jest.fn(() => Promise.resolve({ data: [], error: null })) };
    });

    const result = await fetchAppointmentsPageData();

    expect(nextApi.appointments.list).toHaveBeenCalledWith("workspace-1");
    expect(result.appointments.map((a) => a.id)).toEqual(["a1"]);
  });
});
