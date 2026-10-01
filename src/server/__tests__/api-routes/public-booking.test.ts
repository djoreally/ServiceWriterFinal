import "../../../test/api-routes/env";

jest.mock("@/server/api", () => ({
  ...jest.requireActual("@/server/api"),
  requireWorkspaceMember: jest.fn(),
  requireUser: jest.fn(),
  requireCrmCapability: jest.fn(),
  requireWorkspacePaymentsAddon: jest.fn(),
}));
jest.mock("@/lib/supabase", () => ({ createSupabaseAdminClient: jest.fn() }));
jest.mock("@/server/messaging/booking-confirmation", () => ({
  sendBookingConfirmation: jest.fn(),
}));
jest.mock("@/server/crm/newsletter", () => ({
  enrollNewsletterFromBooking: jest.fn(),
}));

import * as api from "@/server/api";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";
import { enrollNewsletterFromBooking } from "@/server/crm/newsletter";
import { GET as bookingGet } from "../../../../app/api/v1/public-booking/[slug]/route";
import { POST as confirmationPost } from "../../../../app/api/v1/public-booking/[slug]/confirmation/route";
import {
  WS_ID,
  USER_ID,
  APPOINTMENT_ID,
  makeRequest,
  readJson,
  contextWithParams,
  makeSupabaseClient,
  type MockSupabaseClient,
} from "../../../test/api-routes/helpers";

const CUSTOMER_ID = "66666666-6666-4666-8666-666666666666";
const GUEST_EMAIL = "guest@example.com";

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
  jest.clearAllMocks();
});

const profileRow = {
  user_id: USER_ID,
  business_name: "MOMS Mobile Oil Change",
  booking_slug: "momsoilchange",
};

function adminWithRpc(impl: (fn: string, params?: unknown) => Promise<{ data: unknown; error: unknown }>) {
  const client = makeSupabaseClient();
  client.rpc = jest.fn(impl);
  return client;
}

describe("public-booking/[slug] (GET)", () => {
  beforeEach(() => {
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminWithRpc(async (fn) => {
        if (fn === "get_public_booking_profile_v3") return { data: [profileRow], error: null };
        return { data: [], error: null };
      }),
    );
  });

  it("returns 400 for a malformed slug", async () => {
    const { status, body } = await readJson(
      await bookingGet(makeRequest("/api/v1/public-booking/bad%20slug!"), contextWithParams({ slug: "bad slug!" })),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_public_booking_request");
  });

  it("returns 503 for an unknown slug", async () => {
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(
      adminWithRpc(async () => ({ data: [], error: null })),
    );
    const { status, body } = await readJson(
      await bookingGet(makeRequest("/api/v1/public-booking/no-such-shop"), contextWithParams({ slug: "no-such-shop" })),
    );
    expect(status).toBe(503);
    expect(body.error.code).toBe("public_booking_unavailable");
  });

  it("returns 400 for an unknown section", async () => {
    const { status, body } = await readJson(
      await bookingGet(
        makeRequest("/api/v1/public-booking/momsoilchange?section=bogus"),
        contextWithParams({ slug: "momsoilchange" }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_public_booking_request");
  });

  it("returns the provider profile with no-store caching", async () => {
    const res = await bookingGet(
      makeRequest("/api/v1/public-booking/momsoilchange"),
      contextWithParams({ slug: "momsoilchange" }),
    );
    const { status, body } = await readJson(res);
    expect(status).toBe(200);
    expect(body.data).toMatchObject({ business_name: "MOMS Mobile Oil Change" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("maps the 'moms' alias to the canonical booking slug", async () => {
    const client = adminWithRpc(async (fn) => {
      if (fn === "get_public_booking_profile_v3") return { data: [profileRow], error: null };
      return { data: [], error: null };
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(client);
    const { status } = await readJson(
      await bookingGet(makeRequest("/api/v1/public-booking/moms"), contextWithParams({ slug: "moms" })),
    );
    expect(status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith(
      "get_public_booking_profile_v3",
      expect.objectContaining({ booking_slug_param: "momsoilchange" }),
    );
  });

  it("returns the normalized service catalog", async () => {
    const catalogRows = [
      { id: "svc-1", name: "Full Synthetic Oil Change", category: "oil", booking_requirements: [] },
      { id: "svc-2", name: "Interior Detailing", category: "detailing", booking_requirements: ["basic_vehicle"] },
    ];
    const client = adminWithRpc(async (fn) => {
      if (fn === "get_public_booking_profile_v3") return { data: [profileRow], error: null };
      if (fn === "get_public_service_catalog_v2") return { data: catalogRows, error: null };
      return { data: [], error: null };
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(client);
    const { status, body } = await readJson(
      await bookingGet(
        makeRequest("/api/v1/public-booking/momsoilchange?section=catalog"),
        contextWithParams({ slug: "momsoilchange" }),
      ),
    );
    expect(status).toBe(200);
    const oil = body.data.find((row: { id: string }) => row.id === "svc-1");
    const detail = body.data.find((row: { id: string }) => row.id === "svc-2");
    expect(oil.booking_requirements).toEqual(expect.arrayContaining(["basic_vehicle", "oil_fitment"]));
    expect(detail.booking_requirements).toEqual(expect.arrayContaining(["basic_vehicle", "detailing_assessment"]));
  });

  it("falls back to the v1 catalog RPC when v2 is unavailable", async () => {
    const client = adminWithRpc(async (fn) => {
      if (fn === "get_public_booking_profile_v3") return { data: [profileRow], error: null };
      if (fn === "get_public_service_catalog_v2") return { data: null, error: { message: "no v2" } };
      if (fn === "get_public_service_catalog") return { data: [{ id: "svc-9", name: "Tire Rotation" }], error: null };
      return { data: [], error: null };
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(client);
    const { status, body } = await readJson(
      await bookingGet(
        makeRequest("/api/v1/public-booking/momsoilchange?section=catalog"),
        contextWithParams({ slug: "momsoilchange" }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].booking_requirements).toEqual(expect.arrayContaining(["tire_fitment"]));
  });

  it("returns 400 for slots without a date", async () => {
    const { status, body } = await readJson(
      await bookingGet(
        makeRequest("/api/v1/public-booking/momsoilchange?section=slots"),
        contextWithParams({ slug: "momsoilchange" }),
      ),
    );
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_date");
  });

  it("returns booked slots for a date", async () => {
    const client = adminWithRpc(async (fn) => {
      if (fn === "get_public_booking_profile_v3") return { data: [profileRow], error: null };
      if (fn === "get_booked_slots") return { data: [{ starts_at: "2026-09-23T10:00:00Z" }], error: null };
      return { data: [], error: null };
    });
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(client);
    const { status, body } = await readJson(
      await bookingGet(
        makeRequest("/api/v1/public-booking/momsoilchange?section=slots&date=2026-09-23"),
        contextWithParams({ slug: "momsoilchange" }),
      ),
    );
    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(client.rpc).toHaveBeenCalledWith(
      "get_booked_slots",
      expect.objectContaining({ booking_date: "2026-09-23" }),
    );
  });

  it("requires no authentication", async () => {
    await bookingGet(makeRequest("/api/v1/public-booking/momsoilchange"), contextWithParams({ slug: "momsoilchange" }));
    expect(api.requireUser).not.toHaveBeenCalled();
    expect(api.requireWorkspaceMember).not.toHaveBeenCalled();
  });
});

describe("public-booking/[slug]/confirmation (POST)", () => {
  const ctx = contextWithParams({ slug: "momsoilchange" });

  const appointmentRow = {
    id: APPOINTMENT_ID,
    workspace_id: WS_ID,
    customer_id: CUSTOMER_ID,
    metadata: { guest_email: GUEST_EMAIL },
  };

  function confirmationAdmin(overrides: Record<string, { data: unknown; error: unknown }> = {}) {
    return makeSupabaseClient({
      workspace_settings: { data: { workspace_id: WS_ID }, error: null },
      workspaces: { data: { id: WS_ID, name: "MOMS", timezone: "America/New_York", created_by: USER_ID }, error: null },
      appointments: { data: appointmentRow, error: null },
      messaging_consents: { data: null, error: null },
      ...overrides,
    });
  }

  beforeEach(() => {
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(confirmationAdmin());
    (sendBookingConfirmation as jest.Mock).mockResolvedValue({ status: "sent", providerMessageId: "msg_1" });
    (enrollNewsletterFromBooking as jest.Mock).mockResolvedValue({ ok: true });
  });

  const body = { appointment_id: APPOINTMENT_ID, email: GUEST_EMAIL };

  it("returns 400 for a malformed slug", async () => {
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest(`/api/v1/public-booking/bad%20slug!/confirmation`, { method: "POST", body }),
        contextWithParams({ slug: "bad slug!" }),
      ),
    );
    expect(status).toBe(400);
    expect(resBody.error.code).toBe("invalid_confirmation_request");
  });

  it("returns 400 for an invalid body", async () => {
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", {
          method: "POST",
          body: { email: "not-an-email" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(400);
    expect(resBody.error.code).toBe("invalid_confirmation_request");
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("returns 404 when the booking provider is unknown", async () => {
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(
      confirmationAdmin({ workspace_settings: { data: null, error: { code: "PGRST116" } } }),
    );
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/unknown-shop/confirmation", { method: "POST", body }),
        contextWithParams({ slug: "unknown-shop" }),
      ),
    );
    expect(status).toBe(404);
    expect(resBody.error.code).toBe("booking_unavailable");
  });

  it("returns 404 for an unknown booking", async () => {
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(
      confirmationAdmin({ appointments: { data: null, error: { code: "PGRST116" } } }),
    );
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(404);
    expect(resBody.error.code).toBe("confirmation_not_found");
  });

  it("returns 404 when the email does not match the booking", async () => {
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", {
          method: "POST",
          body: { appointment_id: APPOINTMENT_ID, email: "someone-else@example.com" },
        }),
        ctx,
      ),
    );
    expect(status).toBe(404);
    expect(resBody.error.code).toBe("confirmation_not_found");
    expect(sendBookingConfirmation).not.toHaveBeenCalled();
  });

  it("sends the confirmation and returns 200", async () => {
    const { status, body: resBody } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(resBody.data).toMatchObject({ status: "sent", provider_message_id: "msg_1" });
    expect(sendBookingConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceName: "MOMS",
        workspaceTimezone: "America/New_York",
        recipientEmail: GUEST_EMAIL,
      }),
    );
  });

  it("records consent rows and enrolls the newsletter when marketing consent is granted", async () => {
    const admin = confirmationAdmin();
    (createSupabaseAdminClient as jest.Mock).mockReturnValue(admin);
    const { status } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", {
          method: "POST",
          body: {
            ...body,
            transactional_sms_consent: true,
            marketing_email_consent: true,
            consent_texts: {
              transactional_sms: "Reply STOP to opt out.",
              marketing_sms: "Reply STOP to opt out.",
              marketing_email: "Unsubscribe anytime.",
            },
          },
        }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    const consentInserts = admin.from.mock.calls.filter(([table]) => table === "messaging_consents");
    expect(consentInserts.length).toBeGreaterThan(0);
    expect(enrollNewsletterFromBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS_ID,
        customerId: CUSTOMER_ID,
        email: GUEST_EMAIL,
        bookingSlug: "momsoilchange",
      }),
    );
  });

  it("does not enroll the newsletter when marketing consent is not granted", async () => {
    const { status } = await readJson(
      await confirmationPost(
        makeRequest("/api/v1/public-booking/momsoilchange/confirmation", { method: "POST", body }),
        ctx,
      ),
    );
    expect(status).toBe(200);
    expect(enrollNewsletterFromBooking).not.toHaveBeenCalled();
  });
});
