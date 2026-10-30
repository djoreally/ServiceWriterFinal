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

import { convertQuoteToServiceRecord } from "@/application/commands/quotes.command";
import { apiClient } from "@/lib/api-client";

// NOTE: the route-level concurrency contract for POST /v1/quotes/[id]/convert
// lives in src/server/__tests__/api-routes/invoices-quotes.test.ts. It used to
// be tested here with a virtual @/server/api mock, but the convert route
// module can only be bound to one @/server/api mock per jest worker process —
// two suites importing it with different mocks poisoned each other's runs
// (whichever suite ran second saw the first suite's binding and failed).
// This file keeps the client-command concurrency contract only.

const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";
const QUOTE_ID = "33333333-3333-4333-8333-333333333333";

jest.mock("@/application/queries/workspaces.selection", () => ({
  getSelectedWorkspaceId: () => WORKSPACE_A,
}));

describe("quote conversion command concurrency contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends concurrent retries through the API client while the server returns one conversion identity", async () => {
    const responses = new Map<string, { conversion_id: string; service_record_id: string }>();
    const post = apiClient.post as jest.Mock;
    post.mockImplementation(async (path: string, payload: { idempotency_key: string }) => {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5)));
      const key = `${WORKSPACE_A}:${path}:${payload.idempotency_key}`;
      const existing = responses.get(key);
      if (existing) return { data: existing };
      const value = { conversion_id: "conversion-once", service_record_id: "service-once" };
      responses.set(key, value);
      return { data: value };
    });

    const results = await Promise.all(
      Array.from({ length: 24 }, () =>
        convertQuoteToServiceRecord({
          quoteId: QUOTE_ID,
          idempotencyKey: "same-idempotency-key-001",
        }),
      ),
    );

    expect(results.every((result) => result.error === null)).toBe(true);
    expect(new Set(results.map((result) => result.data?.service_record_id)).size).toBe(1);
    expect(post).toHaveBeenCalledTimes(24);
    expect(post.mock.calls.every(([, payload]) => payload.workspace_id === WORKSPACE_A)).toBe(true);
  });

  it("does not silently change tenant context when the selected workspace changes between calls", async () => {
    const post = apiClient.post as jest.Mock;
    post.mockResolvedValue({ data: { conversion_id: "c", service_record_id: "s" } });

    const result = await convertQuoteToServiceRecord({ quoteId: QUOTE_ID, idempotencyKey: "tenant-key-001234" });

    expect(result.error).toBeNull();
    expect(post).toHaveBeenCalledWith(
      `/v1/quotes/${QUOTE_ID}/convert`,
      expect.objectContaining({ workspace_id: WORKSPACE_A }),
    );
    expect(post).not.toHaveBeenCalledWith(
      `/v1/quotes/${QUOTE_ID}/convert`,
      expect.objectContaining({ workspace_id: WORKSPACE_B }),
    );
  });
});
