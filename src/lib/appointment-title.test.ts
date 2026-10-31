import { describe, it, expect } from "@jest/globals";
import {
  composeAppointmentTitleFields,
  withAppointmentTitleFields,
} from "./appointment-title";

// Fri Oct 30, 2026, 10:00 AM in America/New_York (EDT, UTC-4) — the
// truth table's canonical example (T-1).
const LAURIE_START = "2026-10-30T14:00:00.000Z";
const TZ = "America/New_York";

describe("display_title composition (T-1)", () => {
  it("composes the truth table's canonical title", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        confirmation_code: "78361AF6",
        customers: { first_name: "Laurie", last_name: "Buckman" },
        vehicles: { year: 2020, make: "Jaguar", model: "F-PACE" },
        metadata: { service_name: "Full Synthetic Oil Change" },
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
    expect(fields.primary_service_name).toBe("Full Synthetic Oil Change");
    expect(fields.confirmation_code).toBe("78361AF6");
  });

  it("never reads a stored title (appointments.title / metadata.title are retired as display sources)", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: { first_name: "Laurie", last_name: "Buckman" },
        metadata: { title: "STALE STORED TITLE", service_name: "Oil Change" },
        // A stored column value riding on the row must be ignored too.
        ...({ title: "STALE COLUMN TITLE" } as Record<string, unknown>),
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
    expect(fields.display_title).not.toContain("STALE");
  });

  it("renders the schedule segment in the given timezone, defaulting to UTC", () => {
    const row = {
      starts_at: LAURIE_START,
      customers: { first_name: "Laurie", last_name: "Buckman" },
    };
    expect(composeAppointmentTitleFields(row, { timezone: TZ }).display_title).toBe(
      "Laurie Buckman — Fri, Oct 30 · 10:00 AM",
    );
    expect(composeAppointmentTitleFields(row).display_title).toBe(
      "Laurie Buckman — Fri, Oct 30 · 2:00 PM",
    );
  });

  it("survives an unrecognized timezone by rendering in UTC", () => {
    const fields = composeAppointmentTitleFields(
      { starts_at: LAURIE_START, customers: { first_name: "A", last_name: "B" } },
      { timezone: "Not/AZone" },
    );
    expect(fields.display_title).toBe("A B — Fri, Oct 30 · 2:00 PM");
  });
});

describe("multi-vehicle and service resolution (T-1)", () => {
  it("titles a multi-vehicle job by customer; the primary service is the first service line", () => {
    // The row carries the FK vehicle only; the second vehicle lives in the
    // job's service lines (T-4). The caller resolves the primary service
    // from the first line and passes it in — the title never picks a
    // vehicle over the customer.
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        confirmation_code: "78361AF6",
        customers: { first_name: "Laurie", last_name: "Buckman" },
        vehicles: { year: 2020, make: "Jaguar", model: "F-PACE" },
        metadata: {},
      },
      { timezone: TZ, primaryServiceName: "Full Synthetic Oil Change" },
    );
    expect(fields.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
    expect(fields.primary_service_name).toBe("Full Synthetic Oil Change");
  });

  it("prefers the caller-resolved primary service over metadata, then service_type", () => {
    const base = { starts_at: LAURIE_START, customers: { first_name: "A", last_name: "B" } };
    expect(
      composeAppointmentTitleFields(
        { ...base, metadata: { service_name: "Metadata Service" } },
        { primaryServiceName: "First Line Service" },
      ).primary_service_name,
    ).toBe("First Line Service");
    expect(
      composeAppointmentTitleFields({ ...base, metadata: { service_name: "Metadata Service" } })
        .primary_service_name,
    ).toBe("Metadata Service");
    expect(
      composeAppointmentTitleFields({ ...base, metadata: { service_type: "oil_change" } })
        .primary_service_name,
    ).toBe("oil_change");
    expect(composeAppointmentTitleFields(base).primary_service_name).toBeNull();
  });
});

describe("missing pieces (T-1 fallbacks)", () => {
  it("falls back to the guest name when there is no customer record", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: null,
        vehicles: { year: 2015, make: "Cadillac", model: "SRX" },
        metadata: { guest_name: "Micheal Holmes" },
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Micheal Holmes — Fri, Oct 30 · 10:00 AM");
  });

  it("falls back to the company name when the customer has no person name", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: { first_name: null, last_name: null, company_name: "Acme Fleet LLC" },
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Acme Fleet LLC — Fri, Oct 30 · 10:00 AM");
  });

  it("falls back to the vehicle label when no name exists at all", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: null,
        vehicles: { year: 2025, make: "Subaru", model: "Crosstrek" },
        metadata: {},
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("2025 Subaru Crosstrek — Fri, Oct 30 · 10:00 AM");
  });

  it("composes without a vehicle (missing vehicle never breaks the title)", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: { first_name: "Ben", last_name: "Franklin" },
        vehicles: null,
        metadata: {},
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Ben Franklin — Fri, Oct 30 · 10:00 AM");
    expect(fields.confirmation_code).toBeNull();
  });

  it("accepts the joined relations as arrays as well as objects", () => {
    const fields = composeAppointmentTitleFields(
      {
        starts_at: LAURIE_START,
        customers: [{ first_name: "Laurie", last_name: "Buckman" }],
        vehicles: [{ year: 2020, make: "Jaguar", model: "F-PACE" }],
      },
      { timezone: TZ },
    );
    expect(fields.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
  });

  it("drops the schedule segment when starts_at is missing or unparseable", () => {
    const named = { customers: { first_name: "Laurie", last_name: "Buckman" } };
    expect(composeAppointmentTitleFields(named, { timezone: TZ }).display_title).toBe("Laurie Buckman");
    expect(
      composeAppointmentTitleFields({ ...named, starts_at: "not-a-date" }, { timezone: TZ })
        .display_title,
    ).toBe("Laurie Buckman");
  });

  it("keeps the schedule segment when no name exists, and lands on Appointment when nothing exists", () => {
    expect(composeAppointmentTitleFields({ starts_at: LAURIE_START }, { timezone: TZ }).display_title).toBe(
      "Fri, Oct 30 · 10:00 AM",
    );
    expect(composeAppointmentTitleFields({}, { timezone: TZ })).toEqual({
      display_title: "Appointment",
      primary_service_name: null,
      confirmation_code: null,
    });
  });
});

describe("confirmation_code presence (T-1)", () => {
  it("carries the column value through", () => {
    expect(
      composeAppointmentTitleFields({ confirmation_code: "78361AF6" }).confirmation_code,
    ).toBe("78361AF6");
  });

  it("falls back to the metadata copy when the column is empty", () => {
    expect(
      composeAppointmentTitleFields({
        confirmation_code: null,
        metadata: { confirmation_code: "AB12CD34" },
      }).confirmation_code,
    ).toBe("AB12CD34");
  });

  it("is null when no code exists anywhere — never the UUID prefix", () => {
    const fields = composeAppointmentTitleFields({
      ...({ id: "3e208e7d-f271-4316-afc8-55a410acc76a" } as Record<string, unknown>),
      starts_at: LAURIE_START,
      customers: { first_name: "Laurie", last_name: "Buckman" },
    });
    expect(fields.confirmation_code).toBeNull();
    expect(fields.display_title).not.toContain("3E208E7D");
  });
});

describe("withAppointmentTitleFields", () => {
  it("adds the three fields and preserves the row (composes with the B1 wrapper's fields)", () => {
    const row = {
      id: "appt-1",
      status: "confirmed",
      status_label: "Confirmed",
      status_tone: "info",
      starts_at: LAURIE_START,
      confirmation_code: "78361AF6",
      customers: { first_name: "Laurie", last_name: "Buckman" },
    };
    const out = withAppointmentTitleFields(row, { timezone: TZ });
    expect(out.display_title).toBe("Laurie Buckman — Fri, Oct 30 · 10:00 AM");
    expect(out.confirmation_code).toBe("78361AF6");
    expect(out.status_label).toBe("Confirmed");
    expect(out.id).toBe("appt-1");
  });
});
