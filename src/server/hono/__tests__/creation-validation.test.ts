/**
 * Creation-time validation (Build Board Session 7, condition 4).
 *
 * Regression shapes are the exact defects the 2026-11-13 Carfax production
 * pull found in live data — see src/server/hono/lib/creation-validation.ts.
 */
import {
  MAX_ODOMETER_READING,
  isDuplicateServiceRecord,
  normalizeOdometerUnit,
  normalizeUsState,
  normalizeVin,
  serviceDateKey,
  validateMileageValue,
  validateStreetAddress,
  validateVin,
} from "@/server/hono/lib/creation-validation";

describe("validateVin", () => {
  it("accepts a real 17-character VIN", () => {
    expect(validateVin("1FTBR1Y86PKB51521")).toBeNull();
    expect(validateVin("1N6BF0KY7JN800080")).toBeNull();
  });

  it("accepts lowercase input (normalized before checks)", () => {
    expect(validateVin("1ftbr1y86pkb51521")).toBeNull();
    expect(normalizeVin(" 1ftbr1y86pkb51521 ")).toBe("1FTBR1Y86PKB51521");
  });

  it("rejects the production placeholder VIN 5TDGBRCH3LS111111 (repeated-character tail)", () => {
    // This VIN is 17 chars and uses only legal VIN characters — only the
    // placeholder guard catches it.
    expect(validateVin("5TDGBRCH3LS111111")).toMatch(/placeholder/);
  });

  it("rejects any character repeated 6+ times consecutively", () => {
    expect(validateVin("1HGCM888888A04352")).toMatch(/placeholder/);
  });

  it("rejects VINs that are not exactly 17 characters", () => {
    expect(validateVin("1FTBR1Y86PKB5152")).toMatch(/exactly 17/);
    expect(validateVin("1FTBR1Y86PKB515211")).toMatch(/exactly 17/);
    expect(validateVin("")).toMatch(/exactly 17/);
  });

  it("rejects the excluded letters I, O, and Q", () => {
    expect(validateVin("1FTBR1Y86PKB5152I")).toMatch(/excluding I, O, and Q/);
    expect(validateVin("1FTBR1Y86PKB5152O")).toMatch(/excluding I, O, and Q/);
    expect(validateVin("1FTBR1Y86PKB5152Q")).toMatch(/excluding I, O, and Q/);
  });

  it("rejects non-alphanumeric characters", () => {
    expect(validateVin("1FTBR1Y86PKB5152-")).toMatch(/excluding I, O, and Q/);
  });
});

describe("validateMileageValue", () => {
  it("accepts ordinary readings, as numbers or numeric strings", () => {
    expect(validateMileageValue(0)).toBeNull();
    expect(validateMileageValue(123966)).toBeNull();
    expect(validateMileageValue("57700")).toBeNull();
    expect(validateMileageValue(null)).toBeNull();
    expect(validateMileageValue(undefined)).toBeNull();
    expect(validateMileageValue("")).toBeNull();
  });

  it("accepts the production defect reading of 934,000 — it is under the bound", () => {
    // The 934,000-mile Acadia was a data error, but a generic creation bound
    // cannot know a model-year's plausible ceiling. The bound is set at
    // 1,500,000 so it only rejects readings no real vehicle can have
    // (extra-digit typos and unit mix-ups), never a legitimate vehicle.
    expect(validateMileageValue(934000)).toBeNull();
    expect(validateMileageValue(MAX_ODOMETER_READING)).toBeNull();
  });

  it("rejects readings above 1,500,000", () => {
    expect(validateMileageValue(1500001)).toMatch(/cannot exceed/);
    expect(validateMileageValue(9340000)).toMatch(/cannot exceed/);
  });

  it("rejects negative and non-numeric readings", () => {
    expect(validateMileageValue(-1)).toMatch(/negative/);
    expect(validateMileageValue("abc")).toMatch(/must be a number/);
  });
});

describe("normalizeOdometerUnit", () => {
  it("stores the unit uppercase", () => {
    expect(normalizeOdometerUnit("mi")).toBe("MI");
    expect(normalizeOdometerUnit("MI")).toBe("MI");
    expect(normalizeOdometerUnit("km")).toBe("KM");
    expect(normalizeOdometerUnit("miles")).toBe("MI");
    expect(normalizeOdometerUnit("kilometers")).toBe("KM");
  });
});

describe("normalizeUsState", () => {
  it("maps full state names to USPS codes (production stored 'Pennsylvania')", () => {
    expect(normalizeUsState("Pennsylvania")).toBe("PA");
    expect(normalizeUsState("pennsylvania")).toBe("PA");
    expect(normalizeUsState("New Jersey")).toBe("NJ");
  });

  it("uppercases 2-letter codes and leaves non-US values untouched", () => {
    expect(normalizeUsState("pa")).toBe("PA");
    expect(normalizeUsState("PA")).toBe("PA");
    expect(normalizeUsState("Ontario")).toBe("Ontario");
  });
});

describe("validateStreetAddress", () => {
  it("rejects the exact production defect: the doubled full address", () => {
    expect(
      validateStreetAddress("428 Railroad Avenue, Ambler, Pennsylvania, 19002, Ambler, Pennsylvania, 19002"),
    ).toMatch(/street address only/);
  });

  it("rejects a repeated ZIP even when the rest is abbreviated", () => {
    expect(validateStreetAddress("428 Railroad Ave, Ambler, PA 19002, Ambler, PA 19002")).toMatch(/street address only/);
  });

  it("accepts a street-only address and a single full address on one line", () => {
    expect(validateStreetAddress("428 Railroad Avenue")).toBeNull();
    expect(validateStreetAddress("428 Railroad Avenue, Ambler, PA 19002")).toBeNull();
    expect(validateStreetAddress("")).toBeNull();
  });
});

describe("service-record duplicate rule", () => {
  const base = { serviceDate: "2026-11-10", mileage: 123966, invoiceNumber: "INV-104" };

  it("flags the legacy-import duplicate shape (same vehicle scope + date + mileage + invoice)", () => {
    expect(isDuplicateServiceRecord(base, { ...base })).toBe(true);
  });

  it("matches on invoice alone when mileage is absent on both", () => {
    expect(
      isDuplicateServiceRecord(
        { serviceDate: "2026-11-10", mileage: null, invoiceNumber: "inv-104" },
        { serviceDate: "2026-11-10", mileage: null, invoiceNumber: "INV-104" },
      ),
    ).toBe(true);
  });

  it("matches on mileage alone when invoice is absent on both", () => {
    expect(
      isDuplicateServiceRecord(
        { serviceDate: "2026-11-10", mileage: 57700, invoiceNumber: null },
        { serviceDate: "2026-11-10", mileage: 57700, invoiceNumber: null },
      ),
    ).toBe(true);
  });

  it("does not flag a legitimate second same-day visit (different invoice and mileage)", () => {
    expect(
      isDuplicateServiceRecord(base, { serviceDate: "2026-11-10", mileage: 124010, invoiceNumber: "INV-105" }),
    ).toBe(false);
  });

  it("does not flag the same service on a different date", () => {
    expect(isDuplicateServiceRecord(base, { ...base, serviceDate: "2026-11-11" })).toBe(false);
  });

  it("does not flag vehicle + date alone (nothing else present to compare)", () => {
    expect(
      isDuplicateServiceRecord(
        { serviceDate: "2026-11-10", mileage: null, invoiceNumber: null },
        { serviceDate: "2026-11-10", mileage: null, invoiceNumber: null },
      ),
    ).toBe(false);
  });

  it("derives the service date key from timestamps", () => {
    expect(serviceDateKey("2026-11-10T15:04:00.000Z")).toBe("2026-11-10");
    expect(serviceDateKey(null)).toBeNull();
    expect(serviceDateKey("not-a-date")).toBeNull();
  });
});
