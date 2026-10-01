jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { reconcileResendDeliveryStatuses } from "@/server/messaging/resend-reconciliation";

const mockCreateAdminClient = createSupabaseAdminClient as jest.Mock;

type QueryResult = { data: unknown; error: unknown };

interface FakeQuery {
  select(...args: unknown[]): FakeQuery;
  eq(...args: unknown[]): FakeQuery;
  in(...args: unknown[]): FakeQuery;
  not(...args: unknown[]): FakeQuery;
  lt(...args: unknown[]): FakeQuery;
  order(...args: unknown[]): FakeQuery;
  limit(...args: unknown[]): FakeQuery;
  upsert(...args: unknown[]): Promise<{ error: unknown }>;
  then(resolve: (value: QueryResult) => void): void;
}

function fakeQuery(result: QueryResult, upsertResult: { error: unknown } = { error: null }): FakeQuery {
  const query = {
    select: () => query,
    eq: () => query,
    in: () => query,
    not: () => query,
    lt: () => query,
    order: () => query,
    limit: jest.fn(() => query),
    upsert: jest.fn(() => Promise.resolve(upsertResult)),
    then: (resolve: (value: QueryResult) => void) => {
      resolve(result);
    },
  } as unknown as FakeQuery;
  return query;
}

interface Fixture {
  logs: FakeQuery;
  events: FakeQuery;
  rpc: jest.Mock;
  supabase: { from: jest.Mock; rpc: jest.Mock };
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    workspace_id: "ws-1",
    provider_message_id: "re_1",
    recipient_email: "customer@example.com",
    status: "accepted",
    ...overrides,
  };
}

function setup(rows: Record<string, unknown>[], logError: unknown = null, upsertError: unknown = null): Fixture {
  const logs = fakeQuery({ data: rows, error: logError });
  const events = fakeQuery({ data: null, error: null }, { error: upsertError });
  const rpc = jest.fn(() => Promise.resolve({ error: null }));
  const supabase = {
    from: jest.fn((table: string) => (table === "message_logs" ? logs : events)),
    rpc,
  };
  mockCreateAdminClient.mockReturnValue(supabase);
  return { logs, events, rpc, supabase };
}

function resendResponse(snapshot: Record<string, unknown>, ok = true, status = 200) {
  return { ok, status, json: async () => snapshot } as unknown as Response;
}

describe("reconcileResendDeliveryStatuses", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    jest.restoreAllMocks();
  });

  it("reconciles an accepted message to delivered via the Resend API", async () => {
    const { events, rpc } = setup([pendingRow()]);
    global.fetch = jest.fn().mockResolvedValue(
      resendResponse({ id: "re_1", last_event: "delivered", to: ["customer@example.com"] }),
    );

    const reconciled = await reconcileResendDeliveryStatuses();

    expect(reconciled).toBe(1);
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails/re_1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-resend-key");
    expect(init.cache).toBe("no-store");

    const upsertMock = events.upsert as unknown as jest.Mock;
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [payload, options] = upsertMock.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(payload).toMatchObject({
      workspace_id: "ws-1",
      message_log_id: "log-1",
      provider: "resend",
      provider_event_id: "reconcile:re_1:delivered",
      provider_message_id: "re_1",
      status: "delivered",
      recipient_email: "customer@example.com",
    });
    expect(options).toMatchObject({ onConflict: "provider,provider_event_id", ignoreDuplicates: true });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("messaging_apply_delivery_event", {
      target_provider: "resend",
      target_provider_message_id: "re_1",
      target_status: "delivered",
      target_occurred_at: expect.any(String),
      target_failure_code: null,
      target_failure_reason: null,
    });
  });

  it("marks suppressed recipients undeliverable with a failure reason", async () => {
    const { events } = setup([pendingRow({ provider_message_id: "re_2" })]);
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "suppressed" }));

    const reconciled = await reconcileResendDeliveryStatuses();

    expect(reconciled).toBe(1);
    const [payload] = (events.upsert as unknown as jest.Mock).mock.calls[0] as [Record<string, unknown>];
    expect(payload.status).toBe("undeliverable");
    expect(payload.failure_reason).toBe("Provider reports recipient suppressed");
    expect(payload.provider_event_id).toBe("reconcile:re_2:suppressed");
  });

  it("skips rows whose status already matches the provider snapshot", async () => {
    const { events } = setup([pendingRow({ status: "sent" })]);
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "sent" }));

    expect(await reconcileResendDeliveryStatuses()).toBe(0);
    expect(events.upsert).not.toHaveBeenCalled();
  });

  it("skips unmapped provider events and continues to the next row", async () => {
    const { events } = setup([pendingRow({ provider_message_id: "re_unknown" }), pendingRow({ provider_message_id: "re_bounced", id: "log-2" })]);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(resendResponse({ last_event: "not_a_real_event" }))
      .mockResolvedValueOnce(resendResponse({ last_event: "bounced" }));

    const reconciled = await reconcileResendDeliveryStatuses();

    expect(reconciled).toBe(1);
    const [payload] = (events.upsert as unknown as jest.Mock).mock.calls[0] as [Record<string, unknown>];
    expect(payload.status).toBe("bounced");
    expect(payload.message_log_id).toBe("log-2");
  });

  it("treats opened/clicked as delivered and delivery_delayed as accepted", async () => {
    setup([pendingRow({ provider_message_id: "re_open", status: "sent" })]);
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "opened" }));
    expect(await reconcileResendDeliveryStatuses()).toBe(1);

    const { events } = setup([pendingRow({ provider_message_id: "re_delayed", status: "sent" })]);
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "delivery_delayed" }));
    expect(await reconcileResendDeliveryStatuses()).toBe(1);
    const [payload] = (events.upsert as unknown as jest.Mock).mock.calls[0] as [Record<string, unknown>];
    expect(payload.status).toBe("accepted");
  });

  it("continues past API failures, logging and skipping the row", async () => {
    setup([pendingRow({ provider_message_id: "re_fail" }), pendingRow({ provider_message_id: "re_ok", id: "log-2" })]);
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(resendResponse({}, false, 500))
      .mockResolvedValueOnce(resendResponse({ last_event: "failed" }));

    const reconciled = await reconcileResendDeliveryStatuses();

    expect(reconciled).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      "[Lifecycle] Resend status reconciliation failed",
      expect.objectContaining({ messageLogId: "log-1", providerMessageId: "re_fail" }),
    );
  });

  it("continues past event-insert failures", async () => {
    setup([pendingRow()], null, new Error("upsert failed"));
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "delivered" }));

    expect(await reconcileResendDeliveryStatuses()).toBe(0);
    expect(console.error).toHaveBeenCalledWith(
      "[Lifecycle] Resend status reconciliation failed",
      expect.objectContaining({ messageLogId: "log-1" }),
    );
  });

  it("returns 0 and never calls the API when there are no pending rows", async () => {
    setup([]);
    global.fetch = jest.fn();

    expect(await reconcileResendDeliveryStatuses()).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws when the pending query fails", async () => {
    setup([], new Error("db unavailable"));
    global.fetch = jest.fn();

    await expect(reconcileResendDeliveryStatuses()).rejects.toThrow("db unavailable");
  });

  it("clamps the limit between 1 and 100", async () => {
    const fixture = setup([pendingRow()]);
    global.fetch = jest.fn().mockResolvedValue(resendResponse({ last_event: "delivered" }));
    const limitMock = fixture.logs.limit as unknown as jest.Mock;

    await reconcileResendDeliveryStatuses(200);
    expect(limitMock).toHaveBeenCalledWith(100);

    await reconcileResendDeliveryStatuses();
    expect(limitMock).toHaveBeenLastCalledWith(50);

    await reconcileResendDeliveryStatuses(0);
    expect(limitMock).toHaveBeenLastCalledWith(1);
  });
});
