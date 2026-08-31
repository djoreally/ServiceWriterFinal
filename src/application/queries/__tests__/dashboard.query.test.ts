jest.mock("@/integrations/supabase/client", () => {
  const client = {
    from: jest.fn(),
  };
  return { supabase: client, productionSupabase: client };
});

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1", userId: "user-1" })),
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchDashboardReporting } from "@/application/queries/dashboard.query";
import {
  appointmentDayBounds,
  mapCockpitAppointment,
} from "@/application/queries/dashboard-cockpit.query";

type QueryError = { message: string } | null;
type QueryResult = { data: unknown; error: QueryError };

interface ThenableQuery {
  select: jest.Mock<ThenableQuery>;
  neq: jest.Mock<ThenableQuery>;
  eq: jest.Mock<ThenableQuery>;
  gte: jest.Mock<ThenableQuery>;
  lte: jest.Mock<ThenableQuery>;
  order: jest.Mock<ThenableQuery>;
  then: (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

const tableResults: Record<string, QueryResult[]> = {
  payments: [],
  services: [],
  appointments: [],
};

const tableCallCount: Record<string, number> = {
  payments: 0,
  services: 0,
  appointments: 0,
};

function makeThenableQuery(result: QueryResult) {
  const builder = {} as ThenableQuery;
  Object.assign(builder, {
    select: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    order: jest.fn(() => builder),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return builder;
}

describe("fetchDashboardReporting financial reporting mapping", () => {
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockFrom.mockReset();
    tableCallCount.payments = 0;
    tableCallCount.services = 0;
    tableCallCount.appointments = 0;

    tableResults.payments = [];
    tableResults.services = [];
    tableResults.appointments = [];

    mockFrom.mockImplementation((table: string) => {
      const index = tableCallCount[table] ?? 0;
      tableCallCount[table] = index + 1;
      const result = tableResults[table]?.[index] ?? { data: [], error: null };
      return makeThenableQuery(result);
    });
  });

  it("excludes pending payments for cancelled appointments from reporting totals", async () => {
    tableResults.payments = [
      {
        data: [
          {
            id: "p1",
            amount: 5000,
            created_at: "2026-03-01T10:00:00Z",
            status: "pending",
            metadata: {
              customer_email: "a@example.com",
              customer_name: "A",
              appointment_status: "cancelled",
            },
            customers: null,
          },
          {
            id: "p2",
            amount: 7000,
            created_at: "2026-03-01T11:00:00Z",
            status: "pending",
            metadata: {
              customer_email: "b@example.com",
              customer_name: "B",
              appointment_status: "confirmed",
            },
            customers: null,
          },
          {
            id: "p3",
            amount: 9000,
            created_at: "2026-03-01T12:00:00Z",
            status: "succeeded",
            metadata: {
              refunded_amount: 300,
              appointment_status: "cancelled",
            },
            customers: null,
          },
        ],
        error: null,
      },
      {
        data: [{ id: "prev-1", amount: 1000, status: "succeeded", metadata: null }],
        error: null,
      },
    ];

    tableResults.services = [{ data: [], error: null }];
    tableResults.appointments = [{ data: [], error: null }];

    const result = await fetchDashboardReporting({
      from: new Date("2026-03-01T00:00:00Z"),
      to: new Date("2026-03-31T23:59:59Z"),
    });

    expect(result.payments).toEqual([
      {
        id: "p2",
        amount: 7000,
        created_at: "2026-03-01T11:00:00Z",
        status: "pending",
        customer_email: "b@example.com",
        customer_name: "B",
        refund_amount: undefined,
      },
      {
        id: "p3",
        amount: 9000,
        created_at: "2026-03-01T12:00:00Z",
        status: "succeeded",
        customer_email: undefined,
        customer_name: undefined,
        refund_amount: 300,
      },
    ]);

    expect(result.previousPeriodPayments).toEqual([{ id: "prev-1", amount: 1000, status: "succeeded" }]);
  });
});

describe("dashboard cockpit canonical appointment adapter", () => {
  it("maps starts_at and metadata into the cockpit display contract in workspace time", () => {
    expect(mapCockpitAppointment({
      id: "appointment-1",
      status: "requested",
      starts_at: "2026-08-31T13:30:00.000Z",
      metadata: {
        title: "Mobile oil change",
        guest_name: "Jordan",
        estimated_cost: "119.99",
      },
    }, "America/New_York")).toEqual({
      id: "appointment-1",
      title: "Mobile oil change",
      scheduled_date: "2026-08-31",
      scheduled_time: "09:30",
      status: "requested",
      guest_name: "Jordan",
      estimated_cost: 119.99,
    });
  });

  it("builds half-open UTC day bounds using the workspace timezone across DST", () => {
    expect(appointmentDayBounds(
      new Date("2026-03-08T16:00:00.000Z"),
      "America/New_York",
    )).toEqual({
      yesterdayStart: "2026-03-07T05:00:00.000Z",
      todayStart: "2026-03-08T05:00:00.000Z",
      tomorrowStart: "2026-03-09T04:00:00.000Z",
      next8DaysStart: "2026-03-16T04:00:00.000Z",
    });
  });
});
