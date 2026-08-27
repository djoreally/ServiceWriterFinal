jest.mock("@/server/messaging/lifecycle-sender", () => ({
  processLifecycleEventOutbox: jest.fn().mockResolvedValue({ claimed: 0, sent: 0, failed: 0, deadLettered: 0 }),
}));

jest.mock("@/server/notifications/push-outbox", () => ({
  processInAppNotificationPushOutbox: jest.fn().mockResolvedValue({ claimed: 0, sent: 0, failed: 0 }),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { GET as runLifecycleWorker } from "../../../app/api/internal/lifecycle/outbox/route";
import { GET as runPushWorker } from "../../../app/api/internal/notifications/push/outbox/route";
import { processLifecycleEventOutbox } from "@/server/messaging/lifecycle-sender";
import { processInAppNotificationPushOutbox } from "@/server/notifications/push-outbox";

describe("Vercel cron worker authorization", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    jest.clearAllMocks();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  const request = (authorization?: string) => ({
    headers: new Headers(authorization ? { authorization } : undefined),
    json: async () => ({}),
  }) as Request;

  it.each([
    ["lifecycle", runLifecycleWorker, processLifecycleEventOutbox],
    ["push", runPushWorker, processInAppNotificationPushOutbox],
  ] as const)("fails closed when the %s worker secret is missing", async (_name, handler, worker) => {
    delete process.env.CRON_SECRET;
    const response = await handler(request());
    expect(response.status).toBe(401);
    expect(worker).not.toHaveBeenCalled();
  });

  it.each([
    ["lifecycle", runLifecycleWorker, processLifecycleEventOutbox],
    ["push", runPushWorker, processInAppNotificationPushOutbox],
  ] as const)("rejects an incorrect Bearer token for the %s worker", async (_name, handler, worker) => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await handler(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(worker).not.toHaveBeenCalled();
  });

  it.each([
    ["lifecycle", runLifecycleWorker, processLifecycleEventOutbox],
    ["push", runPushWorker, processInAppNotificationPushOutbox],
  ] as const)("accepts Vercel's Bearer token for the %s worker", async (_name, handler, worker) => {
    process.env.CRON_SECRET = "correct-secret";
    const response = await handler(request("Bearer correct-secret"));
    expect(response.status).toBe(200);
    expect(worker).toHaveBeenCalledWith(50);
  });
});
