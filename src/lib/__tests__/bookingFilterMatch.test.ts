jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

import { apiClient } from "@/lib/api-client";
import {
  resolveBookingFilterMatch,
  buildFilterMatchJobContext,
  formatFilterMatchNote,
  requiredPartCategories,
} from "@/lib/bookingFilterMatch";

// Fitment resolution now goes through POST /v1/vehicles/filter-resolution
// (backed server-side by resolve_vehicle_filters_v1); the mock sits at
// that API boundary.
const mockPost = apiClient.post as unknown as jest.Mock;

function filterRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    part_category: "oil_filter",
    part_number: "PH7317",
    brand: "FRAM",
    part_number_alt: null,
    oem_number: "90915-YZZD1",
    quantity: 1,
    engine: "2.5L",
    source: "fram_catalogue",
    confidence: 0.9,
    substitutes: [{ brand: "K&N", part_number: "HP-1017", kind: "cross_reference" }],
    ...overrides,
  };
}

const BASE_DESCRIPTION = "Vehicles: 2020 Toyota Camry\nServices: Oil Change\nPayment: Pay at Service";

describe("booking submit filter-match attachment (end-to-end)", () => {
  beforeEach(() => mockPost.mockReset());

  it("infers oil filter as the required category for an oil change", () => {
    expect(requiredPartCategories(["Full Synthetic Oil Change"])).toEqual(["oil_filter"]);
    // Unknown services still fall back to the oil filter every mobile change consumes.
    expect(requiredPartCategories(["Mystery Service"])).toEqual(["oil_filter"]);
  });

  it("attaches the resolved match to BOTH description and dispatch notes", async () => {
    mockPost.mockResolvedValue({ data: [filterRow()] });

    const matches = await resolveBookingFilterMatch({
      vehicles: [{ year: "2020", make: "Toyota", model: "Camry", licensePlate: "ABC123" }],
      serviceNames: ["Oil Change"],
    });

    const { description, dispatchNotes } = buildFilterMatchJobContext({
      baseDescription: BASE_DESCRIPTION,
      matches,
    });

    expect(description).toContain(BASE_DESCRIPTION);
    expect(description).toContain("Filter match (auto-resolved)");
    expect(description).toContain("2020 Toyota Camry (ABC123)");
    expect(description).toContain("Oil Filter: FRAM PH7317");
    expect(description).toContain("(OEM 90915-YZZD1)");
    expect(description).toContain("[FRAM catalogue]");
    expect(description).toContain("alt: K&N HP-1017");

    // Dispatch notes carry the same technician-facing block.
    expect(dispatchNotes).toBeTruthy();
    expect(description.endsWith(dispatchNotes as string)).toBe(true);
  });

  it("labels a match for EVERY selected vehicle", async () => {
    mockPost.mockImplementation((_path: string, args: { make: string }) =>
      Promise.resolve(
        args.make === "Toyota"
          ? { data: [filterRow()] }
          : { data: [filterRow({ brand: "FRAM", part_number: "PH3593A", oem_number: null })] },
      ),
    );

    const matches = await resolveBookingFilterMatch({
      vehicles: [
        { year: "2020", make: "Toyota", model: "Camry" },
        { year: "2018", make: "Ford", model: "F-150" },
      ],
      serviceNames: ["Oil Change"],
    });

    const { description, dispatchNotes } = buildFilterMatchJobContext({
      baseDescription: BASE_DESCRIPTION,
      matches,
    });

    expect(matches).toHaveLength(2);
    expect(description).toContain("Vehicle 1 of 2: 2020 Toyota Camry");
    expect(description).toContain("Vehicle 2 of 2: 2018 Ford F-150");
    expect(dispatchNotes).toContain("PH7317");
    expect(dispatchNotes).toContain("PH3593A");
  });

  it("still labels a vehicle with no catalogue match so the tech verifies on site", async () => {
    mockPost.mockResolvedValue({ data: [] });

    const matches = await resolveBookingFilterMatch({
      vehicles: [{ year: "2026", make: "Rivian", model: "R1T" }],
      serviceNames: ["Oil Change"],
    });

    const { description, dispatchNotes } = buildFilterMatchJobContext({
      baseDescription: BASE_DESCRIPTION,
      matches,
    });

    expect(description).toContain("2026 Rivian R1T");
    expect(description).toContain("no match on file — verify before the visit");
    expect(dispatchNotes).toContain("no match on file");
  });

  it("keeps the vehicle in job context when the lookup RPC fails", async () => {
    mockPost.mockRejectedValue(new Error("boom"));

    const matches = await resolveBookingFilterMatch({
      vehicles: [{ year: "2020", make: "Toyota", model: "Camry" }],
      serviceNames: ["Oil Change"],
    });

    const { description, dispatchNotes } = buildFilterMatchJobContext({
      baseDescription: BASE_DESCRIPTION,
      matches,
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe("no_match");
    expect(description).toContain(BASE_DESCRIPTION);
    expect(description).toContain("no match on file");
    expect(dispatchNotes).toContain("2020 Toyota Camry");
  });

  it("skips incomplete vehicles and returns an empty note", () => {
    expect(formatFilterMatchNote([])).toBe("");
  });
});
