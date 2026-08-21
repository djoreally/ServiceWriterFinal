import {
  getInitialTireQuantities,
  getRequestedTireQuantity,
  hasValidRequestedTireQuantity,
  reconcileTireQuantitiesForFitment,
} from "@/lib/tire-quantity";

describe("tire quantity normalization", () => {
  it("defaults standard fitment to a visible set of four", () => {
    expect(getInitialTireQuantities(false)).toEqual({
      tireFrontQuantity: 4,
      tireRearQuantity: 0,
    });
  });

  it("defaults staggered fitment to two front and two rear", () => {
    expect(getInitialTireQuantities(true)).toEqual({
      tireFrontQuantity: 2,
      tireRearQuantity: 2,
    });
  });

  it("preserves an intentional standard quantity", () => {
    expect(
      reconcileTireQuantitiesForFitment(
        { tireFrontQuantity: 2, tireRearQuantity: 0 },
        undefined,
      ),
    ).toEqual({ tireFrontQuantity: 2, tireRearQuantity: 0 });
  });

  it("splits quantity when fitment becomes staggered", () => {
    expect(
      reconcileTireQuantitiesForFitment(
        { tireFrontQuantity: 4, tireRearQuantity: 0 },
        "275/40R20",
      ),
    ).toEqual({ tireFrontQuantity: 2, tireRearQuantity: 2 });
  });

  it("combines front and rear quantities when staggered fitment is removed", () => {
    expect(
      reconcileTireQuantitiesForFitment(
        {
          rearTireSize: "275/40R20",
          tireFrontQuantity: 2,
          tireRearQuantity: 2,
        },
        "",
      ),
    ).toEqual({ tireFrontQuantity: 4, tireRearQuantity: 0 });
  });
  it("sums the exact requested front and rear quantities", () => {
    expect(
      getRequestedTireQuantity({ tireFrontQuantity: 2, tireRearQuantity: 1 }),
    ).toBe(3);
  });

  it("rejects missing or invalid quantity combinations", () => {
    expect(hasValidRequestedTireQuantity({})).toBe(false);
    expect(
      hasValidRequestedTireQuantity({
        tireFrontQuantity: 3,
        tireRearQuantity: 0,
      }),
    ).toBe(false);
    expect(
      hasValidRequestedTireQuantity({
        rearTireSize: "275/40R20",
        tireFrontQuantity: 0,
        tireRearQuantity: 0,
      }),
    ).toBe(false);
  });

  it("accepts supported standard and staggered quantities", () => {
    expect(
      hasValidRequestedTireQuantity({
        tireFrontQuantity: 1,
        tireRearQuantity: 0,
      }),
    ).toBe(true);
    expect(
      hasValidRequestedTireQuantity({
        rearTireSize: "275/40R20",
        tireFrontQuantity: 2,
        tireRearQuantity: 2,
      }),
    ).toBe(true);
  });
});
