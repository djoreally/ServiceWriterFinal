jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchDashboardReporting } from "@/application/queries/dashboard.query";

type QueryResult = { data: any; error: any };

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
  const builder: any = {
    select: jest.fn(() => builder),
    neq: jest.fn(() => builder),
    gte: jest.fn(() => builder),
    lte: jest.fn(() => builder),
    order: jest.fn(() => builder),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
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
            customer_email: "a@example.com",
            customer_name: "A",
            refund_amount: null,
            appointment_id: "appt-1",
            appointments: { status: "cancelled" },
          },
          {
            id: "p2",
            amount: 7000,
            created_at: "2026-03-01T11:00:00Z",
            status: "pending",
            customer_email: "b@example.com",
            customer_name: "B",
            refund_amount: null,
            appointment_id: "appt-2",
            appointments: { status: "confirmed" },
          },
          {
            id: "p3",
            amount: 9000,
            created_at: "2026-03-01T12:00:00Z",
            status: "succeeded",
            customer_email: null,
            customer_name: null,
            refund_amount: 300,
            appointment_id: "appt-3",
            appointments: { status: "cancelled" },
          },
        ],
        error: null,
      },
      {
        data: [{ id: "prev-1", amount: 1000, status: "succeeded" }],
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
