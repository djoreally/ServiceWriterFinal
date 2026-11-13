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

// Collected counts on the JOB's date (owner's rule, second half). The
// receipts below are the endpoint's rows: appointment_starts_at is the
// resolved service date, and the cockpit buckets on it via collected_at.
// Pinned to Tuesday 2026-11-10, 10:00 EST.
describe("fetchDashboardCockpit collected figures bucket on the job's date", () => {
  const mockGet = apiClient.get as jest.Mock;

  const receiptRows = [
    // Angela's shape: a Sep 24, 2025 job whose cash closeout was only
    // recorded Mon Nov 9, 2026. It belongs to Sep 2025 — on Nov 10 it
    // must appear in NO 2026 figure, "yesterday" included.
    {
      id: "r-angela-cash",
      amount: 110.23,
      status: "succeeded",
      provider: "other",
      paid_at: "2026-11-09T19:31:00.000Z",
      created_at: "2026-11-09T19:31:00.000Z",
      invoice_id: "inv-569",
      appointment_starts_at: "2025-09-24T14:00:00.000Z",
      metadata: { payment_method: "cash", recorded_manually: true },
    },
    // Her $10.84 waiver, same job: excluded as an adjustment at any date.
    {
      id: "r-angela-waive",
      amount: 10.84,
      status: "succeeded",
      provider: null,
      paid_at: "2026-11-09T19:31:00.000Z",
      created_at: "2026-11-09T19:31:00.000Z",
      invoice_id: "inv-569",
      appointment_starts_at: "2025-09-24T14:00:00.000Z",
      metadata: {
        source: "manual_adjustment",
        adjustment_type: "cash_discount_fee_waive",
        related_payment_id: "r-angela-cash",
      },
    },
    // A Nov 3 job recorded late (paid Nov 20): November money, Nov 3's.
    {
      id: "r-nov3-job",
      amount: 45,
      status: "succeeded",
      provider: "other",
      paid_at: "2026-11-20T17:00:00.000Z",
      created_at: "2026-11-20T17:00:00.000Z",
      invoice_id: "inv-nov3",
      appointment_starts_at: "2026-11-03T15:00:00.000Z",
      metadata: { payment_method: "cash" },
    },
    // A Nov 9 job paid Nov 9: yesterday's money either way.
    {
      id: "r-nov9-job",
      amount: 75,
      status: "succeeded",
      provider: "stripe",
      paid_at: "2026-11-09T16:00:00.000Z",
      created_at: "2026-11-09T16:00:00.000Z",
      invoice_id: "inv-nov9",
      appointment_starts_at: "2026-11-09T15:00:00.000Z",
      metadata: null,
    },
    // An unlinked Nov 9 payment: no appointment, so its paid date rules.
    {
      id: "r-nov9-unlinked",
      amount: 25,
      status: "succeeded",
      provider: "stripe",
      paid_at: "2026-11-09T18:00:00.000Z",
      created_at: "2026-11-09T18:00:00.000Z",
      invoice_id: null,
      appointment_starts_at: null,
      metadata: null,
    },
    // Today's job, paid today.
    {
      id: "r-nov10-job",
      amount: 60,
      status: "succeeded",
      provider: "stripe",
      paid_at: "2026-11-10T14:30:00.000Z",
      created_at: "2026-11-10T14:30:00.000Z",
      invoice_id: "inv-nov10",
      appointment_starts_at: "2026-11-10T13:00:00.000Z",
      metadata: null,
    },
    // A Nov 25 job prepaid Nov 5: counts on Nov 25, the job's date.
    {
      id: "r-nov25-prepaid",
      amount: 90,
      status: "succeeded",
      provider: "stripe",
      paid_at: "2026-11-05T15:00:00.000Z",
      created_at: "2026-11-05T15:00:00.000Z",
      invoice_id: "inv-nov25",
      appointment_starts_at: "2026-11-25T15:00:00.000Z",
      metadata: null,
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

  it("keeps the back-dated closeout out of yesterday — and out of every 2026 window", async () => {
    jest.setSystemTime(new Date("2026-11-10T15:00:00.000Z"));
    const data = await fetchDashboardCockpit();

    expect(data).not.toBeNull();
    expect(data!.collectedToday).toBe(60);
    // Yesterday = the Nov 9 job ($75) + the unlinked Nov 9 payment ($25).
    // Angela's $110.23, recorded yesterday for a Sep 2025 job, is absent.
    expect(data!.collectedYesterday).toBe(100);
    // Week runs from Mon Nov 9 with no upper bound (existing semantics):
    // Nov 9's $100 + today's $60 + the Nov 25 prepayment's $90.
    expect(data!.collectedWeek).toBe(250);
    expect(data!.collectedMonth).toBe(295);
    // YTD is a bucket, not a raw sum of the fetch: the Sep 2025 receipt
    // rides along in the response but belongs to 2025.
    expect(data!.collectedYTD).toBe(295);
    expect(data!.collectedPrevMonthMTD).toBe(0);
  });

  it("makes the month total equal the sum of its days under the new dating", async () => {
    let sumOfDays = 0;
    for (let day = 1; day <= 30; day += 1) {
      jest.setSystemTime(new Date(`2026-11-${String(day).padStart(2, "0")}T15:00:00.000Z`));
      const data = await fetchDashboardCockpit();
      sumOfDays += data!.collectedToday;
    }

    jest.setSystemTime(new Date("2026-11-30T15:00:00.000Z"));
    const endOfMonth = await fetchDashboardCockpit();

    // Nov 3: $45 · Nov 9: $100 · Nov 10: $60 · Nov 25: $90.
    expect(sumOfDays).toBe(295);
    expect(endOfMonth!.collectedMonth).toBe(295);
    expect(endOfMonth!.collectedMonth).toBe(sumOfDays);
  });
});
