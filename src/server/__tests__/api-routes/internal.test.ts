import "../../../test/api-routes/env";

jest.mock("@/server/crm/newsletter", () => ({
  processDueNewsletterSubscribers: jest.fn(),
}));
jest.mock("@/server/messaging/lifecycle-sender", () => ({
  processLifecycleEventOutbox: jest.fn(),
}));
jest.mock("@/server/messaging/appointment-reminder-producer", () => ({
  produceCustomerAppointmentReminders: jest.fn(),
}));
jest.mock("@/server/notifications/push-outbox", () => ({
  processInAppNotificationPushOutbox: jest.fn(),
}));

import { GET as newsletterWeekly } from "../../../../app/api/internal/crm/newsletter/weekly/route";
import { GET as lifecycleOutboxGet, POST as lifecycleOutboxPost } from "../../../../app/api/internal/lifecycle/outbox/route";
import { GET as pushOutboxGet } from "../../../../app/api/internal/notifications/push/outbox/route";
import { processDueNewsletterSubscribers } from "@/server/crm/newsletter";
import { processLifecycleEventOutbox } from "@/server/messaging/lifecycle-sender";
import { produceCustomerAppointmentReminders } from "@/server/messaging/appointment-reminder-producer";
import { processInAppNotificationPushOutbox } from "@/server/notifications/push-outbox";
import { makeRequest, readJson } from "../../../test/api-routes/helpers";

const SECRET = "test-cron-secret";
const authHeaders = (secret: string) => ({ authorization: `Bearer ${secret}` });

describe("internal/crm/newsletter/weekly", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    (processDueNewsletterSubscribers as jest.Mock).mockResolvedValue({ processed: 3, sent: 2 });
  });
  afterEach(() => {
    jest.clearAllMocks();
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("returns 503 when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const { status, body } = await readJson(await newsletterWeekly(makeRequest("/api/internal/crm/newsletter/weekly")));
    expect(status).toBe(503);
    expect(body.error).toBe("worker_not_configured");
    expect(processDueNewsletterSubscribers).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer secret is wrong", async () => {
    const { status, body } = await readJson(
      await newsletterWeekly(makeRequest("/api/internal/crm/newsletter/weekly", { headers: authHeaders("wrong") })),
    );
    expect(status).toBe(401);
    expect(body.error).toBe("unauthorized");
    expect(processDueNewsletterSubscribers).not.toHaveBeenCalled();
  });

  it("returns 401 when no secret is supplied", async () => {
    const { status } = await readJson(await newsletterWeekly(makeRequest("/api/internal/crm/newsletter/weekly")));
    expect(status).toBe(401);
  });

  it("accepts the x-newsletter-worker-secret header", async () => {
    const { status, body } = await readJson(
      await newsletterWeekly(
        makeRequest("/api/internal/crm/newsletter/weekly", { headers: { "x-newsletter-worker-secret": SECRET } }),
      ),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(processDueNewsletterSubscribers).toHaveBeenCalledWith(25);
  });

  it("runs the worker and returns its result on valid auth", async () => {
    const { status, body } = await readJson(
      await newsletterWeekly(makeRequest("/api/internal/crm/newsletter/weekly", { headers: authHeaders(SECRET) })),
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, processed: 3, sent: 2 });
  });

  it("returns 500 when the worker throws", async () => {
    (processDueNewsletterSubscribers as jest.Mock).mockRejectedValue(new Error("boom"));
    const { status, body } = await readJson(
      await newsletterWeekly(makeRequest("/api/internal/crm/newsletter/weekly", { headers: authHeaders(SECRET) })),
    );
    expect(status).toBe(500);
    expect(body.error).toBe("worker_failed");
  });
});

describe("internal/lifecycle/outbox", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    (processLifecycleEventOutbox as jest.Mock).mockResolvedValue({ claimed: 1, sent: 1, failed: 0, deadLettered: 0 });
    (produceCustomerAppointmentReminders as jest.Mock).mockResolvedValue({ scanned: 5, queued: 1, skipped: 0 });
  });
  afterEach(() => {
    jest.clearAllMocks();
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it.each([
    ["GET", lifecycleOutboxGet],
    ["POST", lifecycleOutboxPost],
  ])("returns 401 for %s with a wrong secret", async (_m, handler) => {
    const { status } = await readJson(
      await handler(makeRequest("/api/internal/lifecycle/outbox", { method: "POST", headers: authHeaders("nope") })),
    );
    expect(status).toBe(401);
    expect(processLifecycleEventOutbox).not.toHaveBeenCalled();
  });

  it("accepts the x-lifecycle-worker-secret header", async () => {
    const { status, body } = await readJson(
      await lifecycleOutboxPost(
        makeRequest("/api/internal/lifecycle/outbox", {
          method: "POST",
          headers: { "x-lifecycle-worker-secret": SECRET },
        }),
      ),
    );
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.delivery).toMatchObject({ sent: 1 });
  });

  it("clamps the limit body param", async () => {
    await lifecycleOutboxPost(
      makeRequest("/api/internal/lifecycle/outbox", {
        method: "POST",
        headers: authHeaders(SECRET),
        body: { limit: 5000 },
      }),
    );
    expect(processLifecycleEventOutbox).toHaveBeenCalledWith(50);
  });

  it("returns 500 when the worker throws", async () => {
    (processLifecycleEventOutbox as jest.Mock).mockRejectedValue(new Error("db down"));
    const { status, body } = await readJson(
      await lifecycleOutboxGet(makeRequest("/api/internal/lifecycle/outbox", { headers: authHeaders(SECRET) })),
    );
    expect(status).toBe(500);
    expect(body.error).toBe("worker_failed");
  });
});

describe("internal/notifications/push/outbox", () => {
  const original = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = SECRET;
    (processInAppNotificationPushOutbox as jest.Mock).mockResolvedValue({ claimed: 2, sent: 2, failed: 0 });
  });
  afterEach(() => {
    jest.clearAllMocks();
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  it("returns 503 when CRON_SECRET is missing", async () => {
    delete process.env.CRON_SECRET;
    const { status } = await readJson(await pushOutboxGet(makeRequest("/api/internal/notifications/push/outbox")));
    expect(status).toBe(503);
    expect(processInAppNotificationPushOutbox).not.toHaveBeenCalled();
  });

  it("returns 401 on wrong secret and 200 on correct secret", async () => {
    const bad = await readJson(
      await pushOutboxGet(
        makeRequest("/api/internal/notifications/push/outbox", { headers: authHeaders("wrong") }),
      ),
    );
    expect(bad.status).toBe(401);

    const good = await readJson(
      await pushOutboxGet(
        makeRequest("/api/internal/notifications/push/outbox", { headers: authHeaders(SECRET) }),
      ),
    );
    expect(good.status).toBe(200);
    expect(good.body.ok).toBe(true);
    expect(processInAppNotificationPushOutbox).toHaveBeenCalledTimes(1);
  });
});
