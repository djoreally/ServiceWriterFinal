import {
  computeStoredTotal,
  findDuplicateCandidates,
  findOverlaps,
  isValidEmailLoose,
  localDateInTimezone,
  matchServiceCatalogId,
  phoneDigits,
  phoneKey,
  splitScheduledStart,
  windowsOverlap,
  type AppointmentLite,
  type WebsiteBooking,
} from "./website-bookings";

const booking = (overrides: Partial<WebsiteBooking> = {}): WebsiteBooking => ({
  id: "e529c941-9f5e-4dce-be31-88ab334165d7",
  customer: "Laurenza Giosa",
  email: "lgiosa25@gmail.com",
  phone: "2673421140",
  address: "1323 n tulip drive, West chester, PA 19380",
  payment: "due_at_appointment",
  quoted_total_usd: 122.57,
  scheduled_start: "2026-10-21T08:00:00-04:00",
  scheduled_end: "2026-10-21T09:00:00-04:00",
  service: "Full Synthetic Oil Change",
  source_channel: "google /start",
  status: "confirmed",
  vehicle: { year: 2025, make: "Toyota", model: "Land Cruiser", engine: "Turbo 2.4" },
  ...overrides,
});

const appt = (overrides: Partial<AppointmentLite> = {}): AppointmentLite => ({
  id: "appt-1",
  customer_id: "cust-1",
  vehicle_id: "veh-1",
  starts_at: "2026-10-21T12:00:00.000Z",
  ends_at: "2026-10-21T13:00:00.000Z",
  status: "confirmed",
  guest_phone: "(267) 342-1140",
  title: "Full Synthetic Oil Change",
  vehicle: { year: 2025, make: "Toyota", model: "Land Cruiser" },
  ...overrides,
});

describe("phone helpers", () => {
  it("extracts digits and the last-10 key across formats", () => {
    expect(phoneDigits("(215) 555-0955")).toBe("2155550955");
    expect(phoneKey("(215) 555-0955")).toBe("2155550955");
    expect(phoneKey("+1 215-555-0955")).toBe("2155550955");
    expect(phoneKey("555-0955")).toBe("");
    expect(phoneKey(null)).toBe("");
  });
});

describe("isValidEmailLoose", () => {
  it("mirrors the booking RPC acceptance rule", () => {
    expect(isValidEmailLoose("lgiosa25@gmail.com")).toBe(true);
    expect(isValidEmailLoose("kenneth.nesmith84@gmail.con")).toBe(true); // typo TLD still passes, by design
    expect(isValidEmailLoose("@gmail.com")).toBe(false);
    expect(isValidEmailLoose("not-an-email")).toBe(false);
    expect(isValidEmailLoose(null)).toBe(false);
  });
});

describe("splitScheduledStart", () => {
  it("splits an 8 AM Eastern website booking into the RPC triple", () => {
    const result = splitScheduledStart("2026-10-21T08:00:00-04:00", "2026-10-21T09:00:00-04:00", "America/New_York");
    expect(result).toEqual({ date: "2026-10-21", time: "08:00:00", durationMinutes: 60 });
  });

  it("converts a UTC instant into the workspace timezone", () => {
    const result = splitScheduledStart("2026-10-21T12:00:00Z", null, "America/New_York");
    expect(result.date).toBe("2026-10-21");
    expect(result.time).toBe("08:00:00");
    expect(result.durationMinutes).toBe(60); // default when no end is given
  });

  it("handles standard time (EST) correctly", () => {
    const result = splitScheduledStart("2026-01-15T13:30:00Z", "2026-01-15T14:30:00Z", "America/New_York");
    expect(result).toEqual({ date: "2026-01-15", time: "08:30:00", durationMinutes: 60 });
  });
});

describe("localDateInTimezone", () => {
  it("returns the local calendar date, not the UTC date", () => {
    expect(localDateInTimezone("2026-10-21T02:30:00Z", "America/New_York")).toBe("2026-10-20");
    expect(localDateInTimezone("2026-10-21T12:00:00Z", "America/New_York")).toBe("2026-10-21");
  });
});

describe("windowsOverlap", () => {
  it("detects real overlaps and ignores touching windows", () => {
    expect(windowsOverlap("2026-10-21T12:00:00Z", "2026-10-21T13:00:00Z", "2026-10-21T12:30:00Z", "2026-10-21T13:30:00Z")).toBe(true);
    expect(windowsOverlap("2026-10-21T12:00:00Z", "2026-10-21T13:00:00Z", "2026-10-21T13:00:00Z", "2026-10-21T14:00:00Z")).toBe(false);
    expect(windowsOverlap("2026-10-21T12:00:00Z", "2026-10-21T13:00:00Z", "2026-10-21T14:00:00Z", "2026-10-21T15:00:00Z")).toBe(false);
  });
});

describe("matchServiceCatalogId", () => {
  const catalog = [
    { id: "svc-1", name: "Full Synthetic Oil Change" },
    { id: "svc-2", name: "Mobil 1 Oil Change" },
  ];
  it("matches case-insensitively and punctuation-insensitively", () => {
    expect(matchServiceCatalogId(catalog, "full synthetic oil change")).toBe("svc-1");
    expect(matchServiceCatalogId(catalog, "Full-Synthetic  Oil Change")).toBe("svc-1");
  });
  it("returns null for an unresolvable service", () => {
    expect(matchServiceCatalogId(catalog, "Brake Service")).toBeNull();
  });
});

describe("findDuplicateCandidates", () => {
  it("flags a same-date appointment with the same phone", () => {
    const result = findDuplicateCandidates(booking(), [appt()], null);
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("phone_match");
  });

  it("flags a customer + vehicle match even with a different guest phone", () => {
    const result = findDuplicateCandidates(booking(), [appt({ guest_phone: "2155550100" })], "cust-1");
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe("customer_vehicle_match");
  });

  it("ignores cancelled appointments and unrelated rows", () => {
    expect(findDuplicateCandidates(booking(), [appt({ status: "cancelled" })], "cust-1")).toHaveLength(0);
    expect(
      findDuplicateCandidates(booking(), [appt({ guest_phone: "2155550100", vehicle: { year: 2019, make: "Ford", model: "F-150" } })], "cust-9"),
    ).toHaveLength(0);
  });
});

describe("findOverlaps", () => {
  it("flags overlapping work but not duplicates, cancellations, or adjacent windows", () => {
    const overlapping = appt({ id: "appt-overlap", guest_phone: "2155550100", starts_at: "2026-10-21T12:30:00.000Z", ends_at: "2026-10-21T13:30:00.000Z" });
    const adjacent = appt({ id: "appt-adjacent", guest_phone: "2155550100", starts_at: "2026-10-21T13:00:00.000Z", ends_at: "2026-10-21T14:00:00.000Z" });
    const cancelled = appt({ id: "appt-cancelled", status: "cancelled", starts_at: "2026-10-21T12:15:00.000Z", ends_at: "2026-10-21T12:45:00.000Z" });
    const result = findOverlaps(booking(), [overlapping, adjacent, cancelled], new Set(["appt-1"]));
    expect(result.map((r) => r.appointment_id)).toEqual(["appt-overlap"]);
  });
});

describe("computeStoredTotal", () => {
  it("sums billable items plus tax", () => {
    expect(computeStoredTotal({ tax_amount: 0 }, [{ quantity: 1, unit_price: 122.57 }])).toBe(122.57);
    expect(computeStoredTotal({ tax_amount: 7.35 }, [{ quantity: 2, unit_price: 50 }])).toBe(107.35);
  });
  it("falls back to the metadata estimate when no items exist", () => {
    expect(computeStoredTotal({ estimated_cost: 99, tax_amount: 0 }, [])).toBe(99);
  });
  it("rounds to cents", () => {
    expect(computeStoredTotal({ tax_amount: 0 }, [{ quantity: 3, unit_price: 33.333 }])).toBe(100);
  });
});
