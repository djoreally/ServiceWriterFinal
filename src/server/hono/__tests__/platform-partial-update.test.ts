/**
 * SW-42 / SW-49 — POST /v1/platform/settings/business-profile must never
 * erase settings the caller did not mention.
 *
 * The endpoint serves two callers: the full Settings form save (sends the
 * whole profile) and single-field saves such as the marketplace visibility
 * toggle (sends only { marketplace_opt_in }). The handler used to rebuild
 * every workspace_settings column from the request body — omitted fields
 * became null / {} / [] / false — so one toggle wiped the business profile.
 * These tests pin the guarded behavior against the captured upsert payload:
 * on an upsert, PostgREST writes the columns present in the payload, so a
 * column absent from the payload keeps its stored value.
 */
import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeServerApiMock as mockMakeServerApiMock } from "../test-support/serverApiMock";
import {
  accountImportFactory as mockAccountImportFactory,
  auditFactory as mockAuditFactory,
  bookingConfirmationFactory as mockBookingConfirmationFactory,
  invitationsMailerFactory as mockInvitationsMailerFactory,
  makeSupabaseLibMock as mockMakeSupabaseLibMock,
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
jest.mock("@/server/invitations/mailer", () =>
  mockInvitationsMailerFactory(),
);
jest.mock("@/server/audit", () =>
  mockAuditFactory(),
);
jest.mock("@/server/accountImport", () =>
  mockAccountImportFactory(),
);
jest.mock("@/server/messaging/booking-confirmation", () =>
  mockBookingConfirmationFactory(),
);

import { platformRouter as platformRouterRaw } from "@/server/hono/routes/platform";
import { testRouter } from "../test-support/routerTest";
import { calls, db, resetHarness, WS_ID } from "../test-support/state";

const platformRouter = testRouter(platformRouterRaw);

const STORED_OPERATIONAL = {
  date_format: "MDY",
  service_address: "428 Railroad Avenue",
  weather_guard_enabled: true,
  weather_guard_settings: { threshold: 0.7 },
  custom_unmodelled_key: "keep-me",
};

function seedStoredProfile() {
  db.workspace_members = {
    data: [
      {
        workspace_id: WS_ID,
        role: "owner",
        is_active: true,
        workspaces: { id: WS_ID, is_active: true },
      },
    ],
    error: null,
  };
  db["workspace_settings:single"] = {
    data: { workspace_id: WS_ID, operational_settings: STORED_OPERATIONAL },
    error: null,
  };
}

function settingsUpsertRow(): Record<string, unknown> {
  const entry = calls.upserts.find((u) => u.table === "workspace_settings");
  expect(entry).toBeDefined();
  return entry!.rows as Record<string, unknown>;
}

beforeEach(() => {
  resetHarness();
  seedStoredProfile();
});

describe("POST /v1/platform/settings/business-profile (SW-42)", () => {
  it("a one-field marketplace toggle writes only that field", async () => {
    const res = await platformRouter.request("/v1/platform/settings/business-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { marketplace_opt_in: true } }),
    });
    expect(res.status).toBe(200);

    const row = settingsUpsertRow();
    expect(row.workspace_id).toBe(WS_ID);
    expect(row.marketplace_opt_in).toBe(true);
    // None of the profile columns the caller never mentioned are written.
    for (const column of [
      "owner_name",
      "phone",
      "email",
      "address_line1",
      "website_url",
      "logo_url",
      "terminology",
      "opening_time",
      "closing_time",
      "working_days",
      "booking_slug",
      "service_radius_miles",
      "day_hours",
    ]) {
      expect(row).not.toHaveProperty(column);
    }
    // operational_settings is merged over the stored blob: every stored key
    // survives, including keys this endpoint does not model.
    expect(row.operational_settings).toEqual(STORED_OPERATIONAL);
    // No workspace rename/default write either.
    expect(calls.updates.some((u) => u.table === "workspaces")).toBe(false);
  });

  it("a full profile save still writes every provided field", async () => {
    const res = await platformRouter.request("/v1/platform/settings/business-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: {
          owner_name: "Ty Burton",
          phone: "215-555-0100",
          email: "shop@example.com",
          address: "428 Railroad Avenue",
          website_url: "https://momsoilchange.com",
          terminology: { job: "Visit" },
          opening_time: "08:00",
          closing_time: "16:00",
          working_days: ["mon", "tue"],
          booking_slug: "moms",
          service_radius_miles: 25,
          day_hours: { mon: { open: "08:00", close: "16:00" } },
          marketplace_opt_in: false,
          date_format: "DMY",
        },
      }),
    });
    expect(res.status).toBe(200);

    const row = settingsUpsertRow();
    expect(row.owner_name).toBe("Ty Burton");
    expect(row.phone).toBe("215-555-0100");
    expect(row.email).toBe("shop@example.com");
    expect(row.address_line1).toBe("428 Railroad Avenue");
    expect(row.website_url).toBe("https://momsoilchange.com");
    expect(row.terminology).toEqual({ job: "Visit" });
    expect(row.opening_time).toBe("08:00");
    expect(row.closing_time).toBe("16:00");
    expect(row.working_days).toEqual(["mon", "tue"]);
    expect(row.booking_slug).toBe("moms");
    expect(row.service_radius_miles).toBe(25);
    expect(row.day_hours).toEqual({ mon: { open: "08:00", close: "16:00" } });
    expect(row.marketplace_opt_in).toBe(false);
    // The one provided operational key changes; the rest of the stored blob
    // is preserved.
    expect(row.operational_settings).toEqual({ ...STORED_OPERATIONAL, date_format: "DMY" });
  });

  it("an explicitly emptied field still clears (present-key coercion kept)", async () => {
    const res = await platformRouter.request("/v1/platform/settings/business-profile", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: { phone: "" } }),
    });
    expect(res.status).toBe(200);

    const row = settingsUpsertRow();
    expect(row.phone).toBeNull();
    expect(row).not.toHaveProperty("owner_name");
    expect(row).not.toHaveProperty("marketplace_opt_in");
  });
});
