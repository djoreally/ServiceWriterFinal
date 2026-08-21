jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
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

    const appointmentsBuilder = makeBuilder({
      data: [
        { id: "a1", source: "manual", intake_responses: null },
        { id: "a2", source: "fleet_work_order", intake_responses: null },
        { id: "a3", source: "manual", intake_responses: { fleet_work_order_id: "wo-123" } },
      ],
      error: null,
    });
    const customersBuilder = { select: jest.fn(() => Promise.resolve({ data: [], error: null })) };
    const vehiclesBuilder = { select: jest.fn(() => Promise.resolve({ data: [], error: null })) };
    const catalogBuilder = { select: jest.fn(() => Promise.resolve({ data: [], error: null })) };
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
      if (table === "customers") return customersBuilder;
      if (table === "vehicles") return vehiclesBuilder;
      if (table === "service_catalog") return catalogBuilder;
      if (table === "vans") return vansBuilder;
      if (table === "business_profiles") return profileBuilder;
      return { select: jest.fn(() => Promise.resolve({ data: [], error: null })) };
    });

    const result = await fetchAppointmentsPageData();

    expect(appointmentsBuilder.neq).toHaveBeenCalledWith("source", "fleet_work_order");
    expect(result.appointments.map((a) => a.id)).toEqual(["a1"]);
  });
});
