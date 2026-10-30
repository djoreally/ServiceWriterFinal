import {
  appointmentDescriptionForJobs,
  appointmentTitle,
  appointmentTitleForJobs,
  buildPerJobItems,
  resolveBookingJobs,
  type WebsiteBooking,
  type WebsiteBookingJob,
} from "./website-bookings";

const booking = (overrides: Partial<WebsiteBooking> = {}): WebsiteBooking => ({
  id: "booking-1",
  customer: "Laurie Buckman",
  email: "lbuckman@example.com",
  phone: "6094721760",
  address: "238 Philip Place, Philadelphia, PA 19106",
  payment: "due_at_appointment",
  quoted_total_usd: 245.14,
  scheduled_start: "2026-10-30T10:00:00-04:00",
  scheduled_end: "2026-10-30T11:30:00-04:00",
  service: "Full Synthetic Oil Change",
  source_channel: null,
  status: "confirmed",
  vehicle: { year: 2020, make: "JAGUAR", model: "F-PACE", engine: null },
  ...overrides,
});

const job = (overrides: Partial<WebsiteBookingJob> = {}): WebsiteBookingJob => ({
  position: 0,
  service_id: "svc-website-1",
  service_name: "Full Synthetic Oil Change",
  vehicle: { year: 2020, make: "JAGUAR", model: "F-PACE", engine: null, vin: null },
  subtotal_usd: 0,
  waste_fee_usd: 0,
  processing_fee_usd: 0,
  tax_usd: 0,
  total_usd: 0,
  duration_minutes: 45,
  ...overrides,
});

const sum = (items: Array<{ unit_price: number }>) =>
  Math.round(items.reduce((acc, i) => acc + i.unit_price, 0) * 100) / 100;

describe("resolveBookingJobs", () => {
  it("synthesizes one legacy job (total only, components 0) when jobs are absent", () => {
    const jobs = resolveBookingJobs(booking());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].total_usd).toBe(245.14);
    expect(jobs[0].subtotal_usd).toBe(0);
    expect(jobs[0].waste_fee_usd).toBe(0);
    expect(jobs[0].processing_fee_usd).toBe(0);
    expect(jobs[0].tax_usd).toBe(0);
    expect(jobs[0].service_name).toBe("Full Synthetic Oil Change");
    expect(jobs[0].vehicle).toEqual({ year: 2020, make: "JAGUAR", model: "F-PACE", engine: null, vin: null });
  });

  it("synthesizes when jobs are an empty array", () => {
    expect(resolveBookingJobs(booking({ jobs: [] }))).toHaveLength(1);
  });

  it("returns feed jobs sorted by position", () => {
    const jobs = resolveBookingJobs(
      booking({ jobs: [job({ position: 1, service_name: "B" }), job({ position: 0, service_name: "A" })] }),
    );
    expect(jobs.map((j) => j.service_name)).toEqual(["A", "B"]);
  });
});

describe("buildPerJobItems", () => {
  it("(a) two jobs with distinct components sum exactly to the booking total", () => {
    const jobs = [
      job({
        position: 0,
        subtotal_usd: 100,
        waste_fee_usd: 4,
        processing_fee_usd: 3.12,
        tax_usd: 8,
        total_usd: 115.12,
      }),
      job({
        position: 1,
        service_name: "European Oil Change",
        vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: "2.5", vin: null },
        subtotal_usd: 50,
        waste_fee_usd: 4,
        processing_fee_usd: 1.62,
        tax_usd: 4.32,
        total_usd: 59.94,
      }),
    ];
    const { items, taxTotalUsd, residualUsd } = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 175.06,
      jobs,
      vehicleIds: ["veh-jag", "veh-sub"],
      catalogIds: ["cat-1", "cat-2"],
    });

    expect(residualUsd).toBe(0);
    expect(sum(items)).toBe(175.06);
    expect(taxTotalUsd).toBe(12.32);
    // 2 service items + 3 fee items per job
    expect(items).toHaveLength(8);
    const services = items.filter((i) => i.item_type === "service");
    expect(services.map((i) => i.unit_price)).toEqual([100, 50]);
    expect(services[0].service_catalog_id).toBe("cat-1");
    expect(services[1].service_catalog_id).toBe("cat-2");
    const job1Items = items.filter((i) => i.metadata.job_position === 0);
    const job2Items = items.filter((i) => i.metadata.job_position === 1);
    expect(sum(job1Items)).toBe(115.12);
    expect(sum(job2Items)).toBe(59.94);
  });

  it("(b) pins every fee item to its own job's vehicle with the native fee keys", () => {
    const jobs = [
      job({ position: 0, subtotal_usd: 119, processing_fee_usd: 3.57, total_usd: 122.57 }),
      job({
        position: 1,
        vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: null, vin: null },
        subtotal_usd: 119,
        waste_fee_usd: 4,
        processing_fee_usd: 3.69,
        tax_usd: 10.59,
        total_usd: 137.28,
      }),
    ];
    const { items } = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 259.85,
      jobs,
      vehicleIds: ["veh-jag", "veh-sub"],
      catalogIds: ["cat-1", "cat-1"],
    });

    const job2Fees = items.filter((i) => i.item_type === "fee" && i.metadata.job_position === 1);
    expect(job2Fees.map((f) => f.metadata.fee_key)).toEqual(["waste_oil_fee", "surcharge", "tax"]);
    expect(job2Fees.map((f) => f.description)).toEqual(["Waste Oil Disposal Fee", "Card Processing Fee", "Tax"]);
    expect(job2Fees.every((f) => f.metadata.vehicle_id === "veh-sub")).toBe(true);
    expect(job2Fees.every((f) => f.metadata.source === "website_push")).toBe(true);
    expect(job2Fees.every((f) => f.metadata.website_booking_id === "booking-1")).toBe(true);

    const job1Fees = items.filter((i) => i.item_type === "fee" && i.metadata.job_position === 0);
    expect(job1Fees).toHaveLength(1); // zero waste + zero tax are skipped
    expect(job1Fees[0].metadata.fee_key).toBe("surcharge");
    expect(job1Fees[0].metadata.vehicle_id).toBe("veh-jag");
  });

  it("(c) legacy all-zero components collapse to one lump service item per job", () => {
    const jobs = [
      job({ position: 0, total_usd: 122.57 }),
      job({
        position: 1,
        vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: null, vin: null },
        total_usd: 137.28,
      }),
    ];
    const { items, taxTotalUsd, residualUsd } = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 259.85,
      jobs,
      vehicleIds: ["veh-jag", "veh-sub"],
      catalogIds: ["cat-1", "cat-1"],
    });

    expect(items).toHaveLength(2);
    expect(items.every((i) => i.item_type === "service")).toBe(true);
    expect(items.map((i) => i.unit_price)).toEqual([122.57, 137.28]);
    expect(items.map((i) => i.metadata.vehicle_id)).toEqual(["veh-jag", "veh-sub"]);
    expect(taxTotalUsd).toBe(0);
    expect(residualUsd).toBe(0);
  });

  it("(d) single-job parity: component job sums to its total; legacy job is one item at the quote", () => {
    const component = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 122.57,
      jobs: [job({ subtotal_usd: 119, processing_fee_usd: 3.57, total_usd: 122.57 })],
      vehicleIds: ["veh-1"],
      catalogIds: ["cat-1"],
    });
    expect(sum(component.items)).toBe(122.57);
    expect(component.items.filter((i) => i.item_type === "service")[0].unit_price).toBe(119);

    const legacy = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 122.57,
      jobs: [job({ total_usd: 122.57 })],
      vehicleIds: ["veh-1"],
      catalogIds: ["cat-1"],
    });
    expect(legacy.items).toHaveLength(1);
    expect(legacy.items[0].unit_price).toBe(122.57);
    expect(legacy.items[0].item_type).toBe("service");
  });

  it("applies a rounding residual to the LAST job's service item and reports it", () => {
    const jobs = [
      job({ position: 0, subtotal_usd: 50, processing_fee_usd: 1.5, total_usd: 51.5 }),
      job({
        position: 1,
        vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: null, vin: null },
        subtotal_usd: 48.5,
        total_usd: 48.5,
      }),
    ];
    // Components sum to 100.00 but the booking total is 100.03.
    const { items, residualUsd } = buildPerJobItems({
      bookingId: "booking-1",
      quotedTotalUsd: 100.03,
      jobs,
      vehicleIds: ["veh-jag", "veh-sub"],
      catalogIds: ["cat-1", "cat-1"],
    });
    expect(residualUsd).toBe(0.03);
    expect(sum(items)).toBe(100.03);
    const services = items.filter((i) => i.item_type === "service");
    expect(services[0].unit_price).toBe(50);
    expect(services[1].unit_price).toBe(48.53);
  });
});

describe("appointmentTitleForJobs / appointmentDescriptionForJobs", () => {
  it("names every job vehicle (owner's pattern) for a two-car booking", () => {
    const b = booking({
      jobs: [
        job({ position: 0 }),
        job({
          position: 1,
          vehicle: { year: 2025, make: "SUBARU", model: "Crosstrek", engine: null, vin: null },
        }),
      ],
    });
    const jobs = resolveBookingJobs(b);
    expect(appointmentTitleForJobs(b, jobs)).toBe(
      "Full Synthetic Oil Change — 2020 JAGUAR F-PACE + 2025 SUBARU Crosstrek",
    );
    expect(appointmentDescriptionForJobs(b, jobs)).toBe(
      "Full Synthetic Oil Change for 2020 JAGUAR F-PACE + 2025 SUBARU Crosstrek — booked on the MOMS website.",
    );
  });

  it("matches the existing single-job title when the booking has one job", () => {
    const b = booking();
    const jobs = resolveBookingJobs(b);
    expect(appointmentTitleForJobs(b, jobs)).toBe(appointmentTitle(b));
  });
});
