import {
  deriveWorkingDaysFromAreas,
  matchServiceAreas,
  milesBetween,
} from "@/lib/serviceArea";

const PHILADELPHIA = { lat: 39.9526, lng: -75.1652 };
const NYC = { lat: 40.7128, lng: -74.006 };

describe("serviceArea", () => {
  describe("milesBetween", () => {
    it("returns ~0 for identical points", () => {
      expect(milesBetween(PHILADELPHIA, PHILADELPHIA)).toBeCloseTo(0, 6);
    });

    it("computes a sane Philadelphia → NYC distance", () => {
      // Roughly 80-95 miles by haversine
      const miles = milesBetween(PHILADELPHIA, NYC);
      expect(miles).toBeGreaterThan(70);
      expect(miles).toBeLessThan(110);
    });

    it("is symmetric", () => {
      expect(milesBetween(PHILADELPHIA, NYC)).toBeCloseTo(
        milesBetween(NYC, PHILADELPHIA),
        10,
      );
    });
  });

  describe("matchServiceAreas", () => {
    const areas = [
      {
        id: "a1",
        coordinates: PHILADELPHIA,
        radius_miles: 25,
      },
      {
        id: "a2",
        coordinates: NYC,
        radius_miles: 25,
      },
      { id: "a3" }, // no coordinates — excluded
    ];

    it("matches areas whose radius contains the customer", () => {
      const matched = matchServiceAreas(PHILADELPHIA, areas);
      expect(matched.map((a) => a.id)).toEqual(["a1"]);
    });

    it("matches a customer on the boundary (inclusive)", () => {
      const distance = milesBetween(PHILADELPHIA, NYC);
      const boundary = [{ id: "b", coordinates: PHILADELPHIA, radius_miles: distance }];
      expect(matchServiceAreas(NYC, boundary).map((a) => a.id)).toEqual(["b"]);
    });

    it("returns empty for null coords or empty area lists", () => {
      expect(matchServiceAreas(null, areas)).toEqual([]);
      expect(matchServiceAreas(PHILADELPHIA, [])).toEqual([]);
      expect(matchServiceAreas(PHILADELPHIA, null)).toEqual([]);
    });
  });

  describe("deriveWorkingDaysFromAreas", () => {
    it("unions and title-cases days across areas", () => {
      const days = deriveWorkingDaysFromAreas([
        { id: "a1", days: ["monday", "TUESDAY"] },
        { id: "a2", days: ["tuesday", "wednesday"] },
      ]);
      expect(days).toEqual(expect.arrayContaining(["Monday", "Tuesday", "Wednesday"]));
      expect(days).toHaveLength(3);
    });

    it("returns null when no areas exist", () => {
      expect(deriveWorkingDaysFromAreas([])).toBeNull();
    });

    it("returns an empty array when areas carry no days", () => {
      expect(deriveWorkingDaysFromAreas([{ id: "a1" }])).toEqual([]);
    });
  });
});
