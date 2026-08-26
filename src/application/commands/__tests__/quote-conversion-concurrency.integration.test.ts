import { convertQuoteToServiceRecord } from "@/application/commands/quotes.command";
import { nextApi } from "@/lib/nextApiClient";

class TestRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  private readonly bodyText: string;
  constructor(url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) {
    this.url = url;
    this.method = init.method ?? "GET";
    this.bodyText = init.body ?? "";
    this.headers = new Headers(init.headers);
  }
  async json() { return JSON.parse(this.bodyText); }
}

class TestResponse {
  readonly status: number;
  private readonly bodyText: string;
  constructor(body: string, init: { status?: number } = {}) {
    this.bodyText = body;
    this.status = init.status ?? 200;
  }
  async json() { return JSON.parse(this.bodyText); }
}

(globalThis as unknown as { Request: typeof TestRequest; Response: typeof TestResponse }).Request = TestRequest;
(globalThis as unknown as { Request: typeof TestRequest; Response: typeof TestResponse }).Response = TestResponse;

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

  it("sends concurrent retries through the bridge while the server returns one conversion identity", async () => {
    const responses = new Map<string, { conversion_id: string; service_record_id: string }>();
    const convert = nextApi.quotes.convert as jest.Mock;
    convert.mockImplementation(async (quoteId: string, payload: { idempotency_key: string }) => {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 5)));
      const key = `${WORKSPACE_A}:${quoteId}:${payload.idempotency_key}`;
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
    expect(convert).toHaveBeenCalledTimes(24);
    expect(convert.mock.calls.every(([, payload]) => payload.workspace_id === WORKSPACE_A)).toBe(true);
  });

  it("does not silently change tenant context when the selected workspace changes between calls", async () => {
    const convert = nextApi.quotes.convert as jest.Mock;
    convert.mockResolvedValue({ data: { conversion_id: "c", service_record_id: "s" } });

    const result = await convertQuoteToServiceRecord({ quoteId: QUOTE_ID, idempotencyKey: "tenant-key-001234" });

    expect(result.error).toBeNull();
    expect(convert).toHaveBeenCalledWith(QUOTE_ID, expect.objectContaining({ workspace_id: WORKSPACE_A }));
    expect(convert).not.toHaveBeenCalledWith(QUOTE_ID, expect.objectContaining({ workspace_id: WORKSPACE_B }));
  });
});

type RpcResult = { conversion_id: string; quote_id: string; service_record_id: string; status: "converted"; replayed?: boolean };

const mockRpc = jest.fn();
const mockMember = { workspace_id: WORKSPACE_A, user_id: "99999999-9999-4999-8999-999999999999", role: "admin", is_active: true };

jest.mock("@/server/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code: string;
    constructor(status: number, message: string, code = "api_error") {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  errorResponse: (error: unknown) => {
    const value = error as { status?: number; code?: string; message?: string };
    return new TestResponse(JSON.stringify({ error: { code: value.code ?? "internal_error", message: value.message ?? "An unexpected error occurred." } }), { status: value.status ?? 500 });
  },
  json: (value: unknown, init?: ResponseInit) => new TestResponse(JSON.stringify(value), { status: init?.status ?? 200 }),
  requireWorkspaceMember: jest.fn(async () => ({ supabase: { rpc: mockRpc }, user: { id: mockMember.user_id }, membership: mockMember })),
}), { virtual: true });

describe("quote conversion API concurrency contract", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns the same service record for concurrent requests using one idempotency key", async () => {
    const store = new Map<string, RpcResult>();
    mockRpc.mockImplementation(async (_name: string, args: { p_workspace_id: string; p_quote_id: string; p_idempotency_key: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      const key = `${args.p_workspace_id}:${args.p_quote_id}:${args.p_idempotency_key}`;
      const existing = store.get(key);
      if (existing) return { data: { ...existing, replayed: true }, error: null };
      const result: RpcResult = { conversion_id: "44444444-4444-4444-8444-444444444444", quote_id: args.p_quote_id, service_record_id: "55555555-5555-4555-8555-555555555555", status: "converted" };
      store.set(key, result);
      return { data: result, error: null };
    });

    const requests = Array.from({ length: 20 }, () => new Request(`http://localhost/api/v1/quotes/${QUOTE_ID}/convert`, {
      method: "POST",
      body: JSON.stringify({ workspace_id: WORKSPACE_A, idempotency_key: "api-concurrent-key-001" }),
      headers: { "content-type": "application/json" },
    }));
    const { POST } = await import("../../../../app/api/v1/quotes/[id]/convert/route");
    const responses = await Promise.all(requests.map((request) => POST(request, { params: Promise.resolve({ id: QUOTE_ID }) })));
    const bodies = await Promise.all(responses.map((response) => response.json()));

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(bodies.map((body) => body.data.service_record_id)).size).toBe(1);
    expect(mockRpc).toHaveBeenCalledTimes(20);
    expect(mockRpc.mock.calls.every(([, args]) => args.p_workspace_id === WORKSPACE_A && args.p_quote_id === QUOTE_ID)).toBe(true);
  });

  it("allows only one winner when concurrent callers use different idempotency keys", async () => {
    let winner: RpcResult | null = null;
    mockRpc.mockImplementation(async (_name: string, args: { p_quote_id: string }) => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      if (winner) return { data: null, error: { message: "quote_already_converted" } };
      winner = { conversion_id: "66666666-6666-4666-8666-666666666666", quote_id: args.p_quote_id, service_record_id: "77777777-7777-4777-8777-777777777777", status: "converted" };
      return { data: winner, error: null };
    });

    const { POST } = await import("../../../../app/api/v1/quotes/[id]/convert/route");
    const responses = await Promise.all(["first-key-001234", "second-key-00123"].map((idempotency_key) => POST(
      new Request(`http://localhost/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body: JSON.stringify({ workspace_id: WORKSPACE_A, idempotency_key }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: QUOTE_ID }) },
    )));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed workspace and idempotency input before calling the RPC", async () => {
    const { POST } = await import("../../../../app/api/v1/quotes/[id]/convert/route");
    const response = await POST(
      new Request(`http://localhost/api/v1/quotes/${QUOTE_ID}/convert`, { method: "POST", body: JSON.stringify({ workspace_id: "not-a-uuid", idempotency_key: "short" }), headers: { "content-type": "application/json" } }),
      { params: Promise.resolve({ id: QUOTE_ID }) },
    );

    expect(response.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
