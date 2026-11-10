jest.mock("@/integrations/supabase/client", () => {
  const client = {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  };
  return { supabase: client, productionSupabase: client };
});

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

jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";
import { apiClient } from "@/lib/api-client";
import { fetchAppointmentsPageData } from "@/application/queries/appointments.query";

interface MockQueryResult<T> {
  data: T;
  error: unknown;
}

interface MockBuilder<T> {
  select: jest.Mock<MockBuilder<T>>;
  neq: jest.Mock<Promise<MockQueryResult<T>>>;
  eq: jest.Mock<MockBuilder<T>>;
  order: jest.Mock<Promise<MockQueryResult<T>>>;
  maybeSingle: jest.Mock<Promise<MockQueryResult<T>>>;
}

function makeBuilder<T>(result: MockQueryResult<T>): MockBuilder<T> {
  const builder = {} as MockBuilder<T>;
  Object.assign(builder, {
    select: jest.fn(() => builder),
    neq: jest.fn(() => Promise.resolve(result)),
    eq: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  });
  return builder;
}

interface OrderedBuilder {
  select: jest.Mock<OrderedBuilder>;
  eq: jest.Mock<OrderedBuilder>;
  order: jest.Mock<Promise<MockQueryResult<unknown[]>>>;
}

function makeOrderedBuilder(): OrderedBuilder {
  const builder = {} as OrderedBuilder;
  Object.assign(builder, {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => Promise.resolve({ data: [], error: null })),
  });
  return builder;
}

describe("fetchAppointmentsPageData retail boundary", () => {
  const mockGetUser = supabase.auth.getUser as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockImplementation(async (path: string) => {
      if (path === "/v1/appointments/workspace-context") {
        return { data: { timezone: "America/New_York" } };
      }
      return { data: [] };
    });
  });

  it("excludes fleet_work_order source rows from retail appointments query", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    (nextApi.appointments.list as jest.Mock).mockResolvedValue({
      data: [
        { id: "a1", source: "manual", starts_at: "2026-08-25T09:00:00.000Z", ends_at: "2026-08-25T10:00:00.000Z", status: "confirmed", customer_id: "customer-1", vehicle_id: "vehicle-1", metadata: null },
        { id: "a2", source: "fleet_work_order", starts_at: "2026-08-25T10:00:00.000Z", ends_at: "2026-08-25T11:00:00.000Z", status: "confirmed", customer_id: "customer-2", vehicle_id: "vehicle-2", metadata: null },
        { id: "a3", source: "manual", starts_at: "2026-08-25T11:00:00.000Z", ends_at: "2026-08-25T12:00:00.000Z", status: "confirmed", customer_id: "customer-3", vehicle_id: "vehicle-3", metadata: { fleet_work_order_id: "wo-123" } },
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
    const catalogBuilder = makeOrderedBuilder();
    const vansBuilder = makeOrderedBuilder();
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

    expect(nextApi.appointments.list).toHaveBeenCalledWith("workspace-1", undefined);
    expect(result.appointments.map((a) => a.id)).toEqual(["a1"]);
  });

  it("fetches only the view's window and scopes service-lines to it (Fix 3)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    (nextApi.appointments.list as jest.Mock).mockResolvedValue({
      data: [
        { id: "a1", source: "manual", starts_at: "2026-11-10T14:00:00.000Z", ends_at: "2026-11-10T15:00:00.000Z", status: "confirmed", customer_id: "customer-1", vehicle_id: "vehicle-1", metadata: null },
      ],
    });
    (nextApi.customers.list as jest.Mock).mockResolvedValue({ data: [] });
    (nextApi.vehicles.list as jest.Mock).mockResolvedValue({ data: [] });
    mockFrom.mockImplementation(() => ({
      select: jest.fn(() => Promise.resolve({ data: [], error: null })),
    }));

    // Sunday Nov 8 2026, 10:00 AM in America/New_York: the week window
    // is Sun Nov 8 00:00 EST through Sun Nov 15 00:00 EST.
    await fetchAppointmentsPageData({
      viewMode: "week",
      anchor: new Date("2026-11-08T15:00:00.000Z"),
    });
    expect(nextApi.appointments.list).toHaveBeenCalledWith("workspace-1", {
      from: "2026-11-08T05:00:00.000Z",
      to: "2026-11-15T05:00:00.000Z",
    });
    expect(apiClient.get).toHaveBeenCalledWith(
      "/v1/appointments/service-lines",
      { query: { selected_workspace_id: "workspace-1", appointment_ids: "a1" } },
    );

    // Month view: the grid starts Sun Nov 1 (Nov 1 2026 is a Sunday)
    // and runs through the last day of November. Nov 1 00:00 local is
    // still EDT (fall-back happens at 2 AM), hence 04:00Z, while Dec 1
    // 00:00 is EST, hence 05:00Z — the DST seam the zoned helpers exist
    // for.
    (nextApi.appointments.list as jest.Mock).mockClear();
    await fetchAppointmentsPageData({
      viewMode: "month",
      anchor: new Date("2026-11-08T15:00:00.000Z"),
    });
    expect(nextApi.appointments.list).toHaveBeenCalledWith("workspace-1", {
      from: "2026-11-01T04:00:00.000Z",
      to: "2026-12-01T05:00:00.000Z",
    });
  });
});
