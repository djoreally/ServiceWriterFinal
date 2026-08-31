jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    from: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { getJobRuntime } from "@/application/queries/get-job-runtime.query";

interface QueryResult<T> {
  data: T;
  error: unknown;
}

interface ThenableQuery<T> {
  select: jest.Mock<ThenableQuery<T>>;
  eq: jest.Mock<ThenableQuery<T>>;
  single: jest.Mock<Promise<QueryResult<T>>>;
  then: <TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) => Promise<TResult1 | TResult2>;
}

function makeThenableQuery<T>(result: QueryResult<T>): ThenableQuery<T> {
  const builder = {} as ThenableQuery<T>;
  Object.assign(builder, {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    single: jest.fn(() => Promise.resolve(result)),
    then: (resolve: (value: QueryResult<T>) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });
  return builder;
}

describe("getJobRuntime", () => {
  const mockFrom = supabase.from as jest.Mock;
  const mockGetUser = supabase.auth.getUser as jest.Mock;

  beforeEach(() => {
    mockFrom.mockReset();
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: { id: "org-1" } } });

    mockFrom.mockImplementation((table: string) => {
      if (table === "appointments") {
        return makeThenableQuery({
          data: {
            id: "job-1",
            user_id: "org-1",
            customer_id: "cust-1",
            vehicle_id: "veh-1",
            service_catalog_id: "svc-1",
            title: "Oil Change",
            status: "scheduled",
            dispatch_status: "en_route",
            assigned_technician_id: "tech-1",
            estimated_cost: 120,
            tax_amount: 10,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T01:00:00Z",
            customer: { id: "cust-1", name: "Jane", phone: "555", email: "j@example.com" },
            vehicle: { id: "veh-1", make: "Honda", model: "Civic", year: 2020, vin: "VIN123" },
          },
          error: null,
        });
      }

      return makeThenableQuery({
        data: [{ amount: 5000, refund_amount: 0, status: "succeeded" }],
        error: null,
      });
    });
  });

  it("builds canonical runtime from appointment + ledger", async () => {
    const runtime = await getJobRuntime("job-1", {
      userId: "org-1",
      orgId: "org-1",
      role: "owner",
      permissions: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
    });

    expect(runtime.id).toBe("job-1");
    expect(runtime.lifecycle.status).toBe("en_route");
    expect(runtime.financials.totalCents).toBe(13000);
    expect(runtime.financials.paidCents).toBe(5000);
    expect(runtime.financials.balanceCents).toBe(8000);
    expect(runtime.trust.visibleToUser).toBe(true);
  });
});
