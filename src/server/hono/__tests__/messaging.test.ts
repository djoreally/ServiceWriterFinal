/**
 * Grey-box tests for the messaging Hono router (email settings, webhooks,
 * review actions, outbox processors, legacy growth endpoints).
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  enginemailerFactory as mockEnginemailerFactory,
  lifecycleEventsFactory as mockLifecycleEventsFactory,
  lifecycleSenderFactory as mockLifecycleSenderFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
  pushOutboxFactory as mockPushOutboxFactory,
  reminderProducerFactory as mockReminderProducerFactory,
  resendFactory as mockResendFactory,
  stripeBillingReconciliationFactory as mockStripeBillingReconciliationFactory,
  twilioFactory as mockTwilioFactory,
  webhookIngestFactory as mockWebhookIngestFactory,
} from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/server/api", () =>
  mockMakeServerApiMock(jest.requireActual("@/server/api")),
);
jest.mock("@/lib/supabase", () =>
  mockMakeSupabaseLibMock(),
);
jest.mock("@/server/messaging/enginemailer", () =>
  mockEnginemailerFactory(),
);
jest.mock("@/server/messaging/resend", () =>
  mockResendFactory(),
);
jest.mock("@/server/messaging/twilio", () =>
  mockTwilioFactory(),
);
jest.mock("@/server/messaging/webhook", () =>
  mockWebhookIngestFactory(),
);
jest.mock("@/server/billing/stripe-billing-reconciliation", () =>
  mockStripeBillingReconciliationFactory(),
);
jest.mock("@/server/messaging/lifecycle-events", () =>
  mockLifecycleEventsFactory(),
);
jest.mock("@/server/notifications/push-outbox", () =>
  mockPushOutboxFactory(),
);
jest.mock("@/server/messaging/lifecycle-sender", () =>
  mockLifecycleSenderFactory(),
);
jest.mock("@/server/messaging/appointment-reminder-producer", () =>
  mockReminderProducerFactory(),
);

import { messagingRouter as messagingRouterRaw } from "@/server/hono/routes/messaging";
import { testRouter } from "../test-support/routerTest";
import {
  authState,
  calls,
  db,
  resetHarness,
  USER_ID,
  WS_ID,
} from "../test-support/state";

const messagingRouter = testRouter(messagingRouterRaw);

const SR_ID = "cc0e8400-e29b-41d4-a716-446655440003";

beforeEach(() => {
  resetHarness();
  db["rpc:current_workspace_owner_user_id"] = { data: USER_ID, error: null };
});

describe("messaging router", () => {
  describe("email settings", () => {
    it("returns the caller's email settings", async () => {
      db["email_settings:single"] = {
        data: { user_id: USER_ID, provider: "smtp" },
        error: null,
      };
      const res = await messagingRouter.request("/v1/email-settings");
      expect(res.status).toBe(200);
      expect((await res.json()).data.provider).toBe("smtp");
    });

    it("creates settings when none exist", async () => {
      db["email_settings:single"] = { data: null, error: null };
      const res = await messagingRouter.request("/v1/email-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "smtp", host: "mail.example.com" }),
      });
      expect(res.status).toBe(200);
      expect(
        calls.inserts.some((i) => i.table === "email_settings"),
      ).toBe(true);
    });

    it("returns 401 when unauthenticated", async () => {
      authState.mode = "unauthorized";
      const res = await messagingRouter.request("/v1/email-settings");
      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/webhooks/enginemailer", () => {
    it("accepts a verified delivery webhook", async () => {
      const res = await messagingRouter.request("/v1/webhooks/enginemailer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "delivered" }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).ok).toBe(true);
    });
  });

  describe("POST /v1/reviews/actions", () => {
    const body = { workspace_id: WS_ID, service_record_id: SR_ID };

    it("rejects review requests before service completion", async () => {
      db["service_records:single"] = {
        data: {
          id: SR_ID,
          workspace_id: WS_ID,
          customer_id: "dd0e8400-e29b-41d4-a716-446655440004",
          appointment_id: null,
          status: "in_progress",
          work_performed: "Oil change",
        },
        error: null,
      };
      const res = await messagingRouter.request("/v1/reviews/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(409);
      expect((await res.json()).error.code).toBe("service_not_completed");
    });

    it("enforces staff roles", async () => {
      authState.role = "technician";
      const res = await messagingRouter.request("/v1/reviews/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("route registration", () => {
    it("exposes the push outbox processor", async () => {
      const res = await messagingRouter.request(
        "/internal/notifications/push/outbox",
        { method: "POST" },
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the lifecycle outbox processor", async () => {
      const res = await messagingRouter.request("/internal/lifecycle/outbox", {
        method: "POST",
      });
      expect(res.status).not.toBe(404);
    });

    it("exposes the legacy newsletter endpoints", async () => {
      const res = await messagingRouter.request(
        `/v1/newsletter/subscriber-count?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("exposes the email-testing endpoints", async () => {
      const res = await messagingRouter.request(
        `/v1/email-testing/data?workspace_id=${WS_ID}`,
      );
      expect(res.status).not.toBe(404);
    });

    it("returns 404 for unknown paths", async () => {
      const res = await messagingRouter.request("/v1/messaging-zzz");
      expect(res.status).toBe(404);
    });
  });
});
