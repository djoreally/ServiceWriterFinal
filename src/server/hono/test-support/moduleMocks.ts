/**
 * jest.mock factories for `@/lib/supabase` and the heavy side-effect modules
 * the Hono routers import (messaging pipelines, billing, invitations, audit,
 * import batches, email/SMS adapters). All externals stay mocked — no network.
 *
 * Usage (top of each test file, picking only what the router imports):
 *   jest.mock("@/lib/supabase", () =>
 *     require("../test-support/moduleMocks").makeSupabaseLibMock(),
 *   );
 *   jest.mock("@/server/messaging/lifecycle-events", () =>
 *     require("../test-support/moduleMocks").lifecycleEventsFactory(),
 *   );
 */
import { z } from "zod";
import { mockSupabase } from "./state";

export function makeSupabaseLibMock() {
  return {
    createSupabaseAdminClient: () => mockSupabase,
    createSupabaseAnonServerClient: () => mockSupabase,
    createSupabaseBrowserClient: () => mockSupabase,
    createSupabaseRequestClient: () => mockSupabase,
    createSupabaseServerClient: () => mockSupabase,
    supabaseFunctionsBaseUrl: "https://example.supabase.co/functions/v1",
    supabasePublishableKey: "dummy-publishable-key",
    supabasePublicUrl: "https://example.supabase.co",
  };
}

/** Any `LIFECYCLE_EVENT_KEYS.X` access resolves to the string "X". */
const lifecycleKeys = new Proxy(
  {},
  {
    get: (_t, p) => (typeof p === "string" ? p : undefined),
  },
);

export function lifecycleEventsFactory() {
  return {
    dispatchLifecycleEvent: jest.fn(async () => ({ ok: true })),
    LIFECYCLE_EVENT_KEYS: lifecycleKeys,
  };
}

export function quotePaymentEventsFactory() {
  return {
    dispatchPaymentLifecycle: jest.fn(async () => ({ ok: true })),
    dispatchQuoteLifecycle: jest.fn(async () => ({ ok: true })),
    LIFECYCLE_EVENT_KEYS: lifecycleKeys,
  };
}

export function invoiceEventsFactory() {
  return {
    dispatchInvoiceTransition: jest.fn(async () => ({ ok: true })),
  };
}

export function lifecycleSenderFactory() {
  return {
    sendLifecycleEmail: jest.fn(async () => ({ ok: true })),
    processLifecycleEventOutbox: jest.fn(async () => ({ processed: 0 })),
    enqueueLifecycleEmail: jest.fn(async () => ({ id: "msg-1", status: "queued" })),
  };
}

export function appointmentEventsFactory() {
  return {
    dispatchAppointmentLifecycle: jest.fn(async () => ({ ok: true })),
  };
}

export function stripeInvoiceSyncFactory() {
  return {
    syncCanonicalInvoiceToStripe: jest.fn(async () => ({ ok: true })),
    markStripeInvoicePaidOutOfBand: jest.fn(async () => ({ ok: true })),
  };
}

export function lifecycleActionUrlsFactory() {
  return {
    technicianJobUrl: jest.fn(() => "https://example.com/tech-job"),
  };
}

export function enginemailerFactory() {
  return { EnginemailerEmailAdapter: jest.fn() };
}

export function resendFactory() {
  return { ResendEmailAdapter: jest.fn() };
}

export function twilioFactory() {
  return { TwilioSmsAdapter: jest.fn() };
}

export function webhookIngestFactory() {
  return {
    ingestDeliveryWebhook: jest.fn(async () => ({
      ok: true,
      accepted: true,
      count: 1,
      duplicate: false,
    })),
    ingestInboundWebhook: jest.fn(async () => ({ ok: true })),
  };
}

export function stripeBillingReconciliationFactory() {
  return {
    reconcileServiceWriterBillingEvent: jest.fn(async () => ({ ok: true })),
  };
}

export function pushOutboxFactory() {
  return {
    processInAppNotificationPushOutbox: jest.fn(async () => ({ processed: 3 })),
  };
}

export function reminderProducerFactory() {
  return {
    produceCustomerAppointmentReminders: jest.fn(async () => ({ queued: 0 })),
  };
}

export function workspaceBillingFactory() {
  return {
    checkoutCatalogKeys: ["price_test_1"],
    ensureWorkspaceBilling: jest.fn(async () => ({ id: "wb-1" })),
    getCatalogPrice: jest.fn(() => 1000),
    resolveAuthorizedBillingWorkspace: jest.fn(async () => ({
      workspace_id: "ws-1",
    })),
    stripeBillingClient: jest.fn(() => ({})),
  };
}

export function stripeWorkspaceExecutionFactory() {
  return {
    encryptPaymentCredential: jest.fn(async () => "encrypted-credential"),
    resolveStripeWorkspaceExecution: jest.fn(async () => ({})),
  };
}

export function invitationsMailerFactory() {
  return {
    sendInvitationEmail: jest.fn(async () => ({ ok: true })),
  };
}

export function auditFactory() {
  return {
    recordOperationalAudit: jest.fn(async () => ({ ok: true })),
  };
}

export function accountImportFactory() {
  // The router calls `.optional()` on the schema at module load, so this must
  // be a real zod schema, not a stub.
  return {
    accountExportSchema: z.object({}).passthrough(),
    createImportBatch: jest.fn(async () => ({ id: "batch-1" })),
    executeImportBatch: jest.fn(async () => ({ ok: true })),
    rollbackImportBatch: jest.fn(async () => ({ ok: true })),
  };
}

export function bookingConfirmationFactory() {
  return {
    sendBookingConfirmation: jest.fn(async () => ({ ok: true })),
  };
}
