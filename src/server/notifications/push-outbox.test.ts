jest.mock("web-push", () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    sendNotification: jest.fn(),
  },
}));
jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

type PushOutboxModule = typeof import("@/server/notifications/push-outbox");

interface WebpushMock {
  setVapidDetails: jest.Mock;
  sendNotification: jest.Mock;
}

function pushRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "outbox-1",
    notification_id: "notif-1",
    subscription_id: "sub-9",
    attempts: 0,
    worker_id: "worker-a",
    title: "Appointment confirmed",
    message: "Your oil change is booked for Friday.",
    metadata: { url: "/tech-app/jobs/123" },
    endpoint: "https://push.example/endpoint",
    p256dh: "p256dh-key",
    auth_key: "auth-key",
    ...overrides,
  };
}

describe("processInAppNotificationPushOutbox", () => {
  let webpushMock: WebpushMock;
  let processInAppNotificationPushOutbox: PushOutboxModule["processInAppNotificationPushOutbox"];
  let rpcMock: jest.Mock;
  let fromMock: jest.Mock;

  beforeEach(async () => {
    rpcMock = jest.fn();
    fromMock = jest.fn().mockReturnValue({
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });
    // The module caches `vapidConfigured` at module scope, so load a fresh
    // copy per test to keep the VAPID tests order-independent. resetModules
    // also re-instantiates the hoisted module mocks, so re-acquire them here
    // instead of relying on the file's top-level imports.
    jest.resetModules();
    webpushMock = (jest.requireMock("web-push") as { default: WebpushMock }).default;
    webpushMock.sendNotification.mockResolvedValue(undefined);
    const supabaseModule = await import("@/lib/supabase");
    (supabaseModule.createSupabaseAdminClient as jest.Mock).mockReturnValue({
      rpc: rpcMock,
      from: fromMock,
    });
    processInAppNotificationPushOutbox = (
      await import("@/server/notifications/push-outbox")
    ).processInAppNotificationPushOutbox;

    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-public";
    process.env.VAPID_PRIVATE_KEY = "test-vapid-private";

    rpcMock.mockImplementation((name: string) => {
      if (name === "claim_in_app_push_outbox") return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  function claimRows(rows: Record<string, unknown>[]) {
    rpcMock.mockImplementation((name: string) => {
      if (name === "claim_in_app_push_outbox") return Promise.resolve({ data: rows, error: null });
      return Promise.resolve({ data: null, error: null });
    });
  }

  it("no-ops when the outbox is empty", async () => {
    const result = await processInAppNotificationPushOutbox(50, "worker-1");

    expect(result).toEqual({ claimed: 0, sent: 0, failed: 0, staleSubscriptions: 0 });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("claim_in_app_push_outbox", {
      p_limit: 50,
      p_worker_id: "worker-1",
    });
  });

  it("throws when the claim RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "rpc exploded" } });

    await expect(processInAppNotificationPushOutbox(50, "worker-1")).rejects.toEqual({ message: "rpc exploded" });
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
  });

  it("clamps the claim limit between 1 and 200", async () => {
    await processInAppNotificationPushOutbox(0, "worker-1");
    expect(rpcMock).toHaveBeenCalledWith("claim_in_app_push_outbox", { p_limit: 1, p_worker_id: "worker-1" });

    await processInAppNotificationPushOutbox(500, "worker-1");
    expect(rpcMock).toHaveBeenCalledWith("claim_in_app_push_outbox", { p_limit: 200, p_worker_id: "worker-1" });
  });

  it("sends each claimed row and marks it complete", async () => {
    claimRows([pushRow()]);

    const result = await processInAppNotificationPushOutbox(50, "worker-1");

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, staleSubscriptions: 0 });
    expect(webpushMock.setVapidDetails).toHaveBeenCalledWith(
      "mailto:security@servicewriter.xyz",
      "test-vapid-public",
      "test-vapid-private",
    );
    expect(webpushMock.sendNotification).toHaveBeenCalledTimes(1);
    const [subscription, payload, options] = webpushMock.sendNotification.mock.calls[0];
    expect(subscription).toEqual({
      endpoint: "https://push.example/endpoint",
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });
    expect(JSON.parse(String(payload))).toEqual({
      title: "Appointment confirmed",
      body: "Your oil change is booked for Friday.",
      tag: "notification:notif-1",
      url: "/tech-app/jobs/123",
    });
    expect(options).toEqual({ TTL: 300, urgency: "high" });
    expect(rpcMock).toHaveBeenCalledWith("complete_in_app_push_outbox", {
      p_id: "outbox-1",
      p_worker_id: "worker-1",
      p_sent: true,
      p_error: null,
      p_retry_seconds: 300,
    });
  });

  it("defaults the notification URL to /tech-app when metadata is missing or unsafe", async () => {
    claimRows([pushRow({ id: "outbox-2", metadata: null }), pushRow({ id: "outbox-3", metadata: { url: "https://evil.example/x" } })]);

    await processInAppNotificationPushOutbox(50, "worker-1");

    const payloads = webpushMock.sendNotification.mock.calls.map((call) => JSON.parse(String(call[1])));
    expect(payloads[0].url).toBe("/tech-app");
    expect(payloads[1].url).toBe("/tech-app");
  });

  it("records provider failures with exponential backoff", async () => {
    webpushMock.sendNotification.mockRejectedValue(new Error("provider exploded"));
    claimRows([pushRow({ attempts: 2 })]);

    const result = await processInAppNotificationPushOutbox(50, "worker-1");

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, staleSubscriptions: 0 });
    expect(rpcMock).toHaveBeenCalledWith("complete_in_app_push_outbox", {
      p_id: "outbox-1",
      p_worker_id: "worker-1",
      p_sent: false,
      p_error: "provider exploded",
      p_retry_seconds: 120,
    });
    expect(fromMock).not.toHaveBeenCalledWith("tech_push_subscriptions");
  });

  it("caps the retry backoff for heavily-retried rows", async () => {
    webpushMock.sendNotification.mockRejectedValue(new Error("provider exploded"));
    claimRows([pushRow({ attempts: 20 })]);

    await processInAppNotificationPushOutbox(50, "worker-1");

    expect(rpcMock).toHaveBeenCalledWith(
      "complete_in_app_push_outbox",
      expect.objectContaining({ p_retry_seconds: 7680 }),
    );
  });

  it("disables stale subscriptions on 404/410 responses", async () => {
    webpushMock.sendNotification.mockRejectedValue({ statusCode: 410 });
    claimRows([pushRow()]);

    const result = await processInAppNotificationPushOutbox(50, "worker-1");

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 1, staleSubscriptions: 1 });
    expect(fromMock).toHaveBeenCalledWith("tech_push_subscriptions");
    const updateMock = fromMock.mock.results[0].value.update as jest.Mock;
    expect(updateMock).toHaveBeenCalledWith({ disabled_at: expect.any(String) });
    const eqMock = updateMock.mock.results[0].value.eq as jest.Mock;
    expect(eqMock).toHaveBeenCalledWith("id", "sub-9");
    expect(rpcMock).toHaveBeenCalledWith("complete_in_app_push_outbox", {
      p_id: "outbox-1",
      p_worker_id: "worker-1",
      p_sent: false,
      p_error: "subscription_gone",
      p_retry_seconds: 30,
    });
  });

  it("processes mixed success and failure batches", async () => {
    webpushMock.sendNotification
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"));
    claimRows([pushRow({ id: "outbox-1" }), pushRow({ id: "outbox-2" })]);

    const result = await processInAppNotificationPushOutbox(50, "worker-1");

    expect(result).toEqual({ claimed: 2, sent: 1, failed: 1, staleSubscriptions: 0 });
  });

  it("throws when VAPID keys are not configured", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    claimRows([pushRow()]);

    await expect(processInAppNotificationPushOutbox(50, "worker-1")).rejects.toThrow(
      "Web Push VAPID keys are not configured",
    );
    expect(webpushMock.sendNotification).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalledWith("complete_in_app_push_outbox", expect.anything());
  });
});
