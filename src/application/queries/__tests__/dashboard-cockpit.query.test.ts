jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

jest.mock("@/application/queries/settings.query", () => ({
  resolveCurrentWorkspace: jest.fn(async () => ({ workspaceId: "workspace-1" })),
  fetchBusinessSettings: jest.fn(async () => ({
    timezone: "America/New_York",
    business_name: "MOMS Test",
  })),
}));

import { apiClient } from "@/lib/api-client";
import { fetchDashboardCockpit } from "@/application/queries/dashboard-cockpit.query";

// The cockpit buckets ONE YTD fetch of canonical cash receipts into
// today / yesterday / week / month / YTD / prev-month-MTD. A cash
// closeout's waiver row (metadata.source = "manual_adjustment") must be
// absent from every bucket — collected means succeeded payments that
// are NOT adjustments. Pinned to Wednesday 2026-11-04, 10:00 EST.
describe("fetchDashboardCockpit collected figures exclude adjustments", () => {
  const mockGet = apiClient.get as jest.Mock;

  const receiptRows = [
    // Today: $100 cash in hand...
    {
      id: "r-today-cash",
      amount: 100,
      status: "succeeded",
      provider: "other",
      paid_at: "2026-11-04T14:00:00.000Z",
      created_at: "2026-11-04T14:00:00.000Z",
      metadata: { payment_method: "cash" },
    },
    // ...plus a $20 waiver from the same closeout. Must count nowhere.
    {
      id: "r-today-waive",
      amount: 20,
      status: "succeeded",
      provider: null,
      paid_at: "2026-11-04T14:05:00.000Z",
      created_at: "2026-11-04T14:05:00.000Z",
      metadata: {
        source: "manual_adjustment",
        adjustment_type: "cash_discount_fee_waive",
        related_payment_id: "r-today-cash",
      },
    },
    // Yesterday: $50, metadata-less row — still counts.
    {
      id: "r-yesterday-cash",
      amount: 50,
      status: "succeeded",
      provider: "stripe",
      paid_at: "2026-11-03T15:00:00.000Z",
      created_at: "2026-11-03T15:00:00.000Z",
      metadata: null,
    },
    // Oct 3: inside the prev-month month-to-date window (through Oct 4).
    {
      id: "r-oct3-cash",
      amount: 30,
      status: "succeeded",
      provider: "other",
      paid_at: "2026-10-03T15:00:00.000Z",
      created_at: "2026-10-03T15:00:00.000Z",
      metadata: { payment_type: "cash" },
    },
    // Oct 20: YTD only, with its own $10 waiver riding along.
    {
      id: "r-oct20-cash",
      amount: 40,
      status: "succeeded",
      provider: "other",
      paid_at: "2026-10-20T15:00:00.000Z",
      created_at: "2026-10-20T15:00:00.000Z",
      metadata: {},
    },
    {
      id: "r-oct20-waive",
      amount: 10,
      status: "succeeded",
      provider: null,
      paid_at: "2026-10-20T15:05:00.000Z",
      created_at: "2026-10-20T15:05:00.000Z",
      metadata: {
        source: "manual_adjustment",
        adjustment_type: "cash_discount_fee_waive",
        related_payment_id: "r-oct20-cash",
      },
    },
  ];

  const cockpitPayload = {
    todayApptRows: [],
    inProgressRows: [],
    completedTodayRows: [],
    completedMonthRows: [],
    attention: [],
    weekAhead: [],
    day: { jobsToday: 0, jobsInProgress: 0, jobsToGo: 0, bookedToday: 0 },
    outstanding: { count: 0, total: 0 },
    userDisplayName: null,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-04T15:00:00.000Z"));
    mockGet.mockReset();
    mockGet.mockImplementation(async (url: string) => {
      if (url === "/v1/billing/cash-receipts") return { data: receiptRows };
      if (url === "/v1/platform/dashboard/cockpit-rows") return cockpitPayload;
      throw new Error(`Unexpected API URL: ${url}`);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("excludes waiver rows from today, week, month, YTD and prev-month figures alike", async () => {
    const data = await fetchDashboardCockpit();

    expect(data).not.toBeNull();
    // Cash only: 100 today; the $20 waiver appears in NO bucket.
    expect(data!.collectedToday).toBe(100);
    expect(data!.collectedYesterday).toBe(50);
    expect(data!.collectedWeek).toBe(150);
    expect(data!.collectedMonth).toBe(150);
    // YTD = 100 + 50 + 30 + 40 cash; neither waiver ($20, $10) counts.
    expect(data!.collectedYTD).toBe(220);
    expect(data!.collectedPrevMonthMTD).toBe(30);
  });
});
