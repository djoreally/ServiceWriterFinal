import {
  computeSpecStatus,
  mergeOilSpec,
  orderedUnion,
  resolveCatalogOilValues,
} from "../vehicle-spec-merge";

describe("B4 vehicle spec merge (T-2/T-3)", () => {
  describe("mergeOilSpec precedence", () => {
    it("learned beats catalog beats snapshot, per field", () => {
      const merged = mergeOilSpec({
        learned: { oilType: "0W-20", oilCapacity: "5.8 qt" },
        catalog: { oilType: "0W-30", oilCapacity: "7.4 qt", oilFilter: "CAT-FILTER" },
        snapshot: { oilType: "5W-30", oilCapacity: "6.0 qt", oilFilter: "SNAP-FILTER", engine: "2.0L" },
      });
      // The learned 5.8 qt actual wins over the published 7.4 qt — the
      // working spec is what the tech pours by (T-3).
      expect(merged.oil).toEqual({
        engine: "2.0L",
        oilType: "0W-20",
        oilCapacity: "5.8 qt",
        oilFilter: "CAT-FILTER",
        capacitySource: "manual",
      });
      expect(merged.specSources).toEqual({
        engine: "snapshot",
        oilType: "learned",
        oilCapacity: "learned",
        oilFilter: "catalog",
      });
      expect(merged.specStatus).toBe("from_catalog");
    });

    it("NULL learned fields fall to the catalog (the website-push shape)", () => {
      const merged = mergeOilSpec({
        learned: { engine: "2.0L I4", oilType: undefined, oilCapacity: undefined, oilFilter: undefined },
        catalog: { engine: "2.0L I4", oilType: "0W-20", oilCapacity: "7.4 qt", oilFilter: "OEM Cartridge" },
        snapshot: null,
      });
      expect(merged.oil?.oilType).toBe("0W-20");
      expect(merged.oil?.oilCapacity).toBe("7.4 qt");
      expect(merged.oil?.capacitySource).toBe("db");
      expect(merged.specSources.oilType).toBe("catalog");
      expect(merged.specStatus).toBe("from_catalog");
    });

    it("a fully learned group is verified", () => {
      const merged = mergeOilSpec({
        learned: { engine: "2.5L", oilType: "0W-20", oilCapacity: "4.7 qt", oilFilter: "NAPA Gold 7055" },
        catalog: { oilType: "0W-16", oilCapacity: "4.5 qt", oilFilter: "OTHER" },
        snapshot: null,
      });
      expect(merged.specStatus).toBe("verified");
      expect(merged.oil?.oilFilter).toBe("NAPA Gold 7055");
    });

    it("snapshot-only values surface as provenance but still need verification", () => {
      const merged = mergeOilSpec({
        learned: null,
        catalog: null,
        snapshot: { oilType: "5W-30", oilCapacity: "6.0 qt", oilFilter: "PF63E", capacitySource: "ai" },
      });
      expect(merged.oil?.oilType).toBe("5W-30");
      expect(merged.oil?.capacitySource).toBe("ai");
      expect(merged.specSources.oilFilter).toBe("snapshot");
      expect(merged.specStatus).toBe("needs_verification");
    });

    it("no values anywhere yields no oil block and needs_verification", () => {
      const merged = mergeOilSpec({ learned: { engine: undefined }, catalog: {}, snapshot: null });
      expect(merged.oil).toBeUndefined();
      expect(merged.specSources).toEqual({});
      expect(merged.specStatus).toBe("needs_verification");
    });

    it("an incomplete group needs verification even when the present fields are learned", () => {
      const merged = mergeOilSpec({
        learned: { oilType: "0W-20", oilCapacity: "5.8 qt" },
        catalog: null,
        snapshot: null,
      });
      expect(merged.specStatus).toBe("needs_verification");
    });
  });

  describe("computeSpecStatus", () => {
    it("engine provenance does not gate the oil group's status", () => {
      expect(
        computeSpecStatus(
          { engine: "2.0L", oilType: "0W-20", oilCapacity: "5.8 qt", oilFilter: "F1" },
          { engine: "snapshot", oilType: "learned", oilCapacity: "learned", oilFilter: "learned" },
        ),
      ).toBe("verified");
    });
  });

  describe("resolveCatalogOilValues", () => {
    const rows = [
      { engine: "2.0L Turbo", oilType: "0W-20", oilCapacity: "7.4 qt", oilFilter: "OEM Cartridge" },
      { engine: "3.0L V6", oilType: "0W-30", oilCapacity: "6.5 qt", oilFilter: "V6 Filter" },
    ];

    it("an engine hint narrows the pool to the matching row", () => {
      const resolved = resolveCatalogOilValues(rows, "2.0L I4 Turbo");
      expect(resolved.oilCapacity).toBe("7.4 qt");
      expect(resolved.oilFilter).toBe("OEM Cartridge");
    });

    it("without a hint, disagreeing rows resolve nothing (never invents)", () => {
      const resolved = resolveCatalogOilValues(rows, null);
      expect(resolved).toEqual({});
    });

    it("agreeing rows resolve by consensus even across engines", () => {
      const resolved = resolveCatalogOilValues(
        [
          { engine: "2.5L", oilType: "0W-20", oilCapacity: "4.7 qt", oilFilter: "7055" },
          { engine: "2.5L Hybrid", oilType: "0W-20", oilCapacity: "4.7 qt", oilFilter: "7055" },
        ],
        null,
      );
      expect(resolved.oilType).toBe("0W-20");
      expect(resolved.oilCapacity).toBe("4.7 qt");
    });

    it("a hint that matches nothing leaves the whole pool to consensus", () => {
      const resolved = resolveCatalogOilValues(
        [{ engine: "2.5L", oilType: "0W-20", oilCapacity: "4.7 qt", oilFilter: "7055" }],
        "9.9L W16",
      );
      expect(resolved.oilCapacity).toBe("4.7 qt");
    });

    it("an unhelpful field disagreement blocks only that field", () => {
      const resolved = resolveCatalogOilValues(
        [
          { engine: "2.0L", oilType: "0W-20", oilCapacity: "7.4 qt", oilFilter: "A" },
          { engine: "2.0L", oilType: "0W-20", oilCapacity: "7.9 qt", oilFilter: "A" },
        ],
        "2.0L",
      );
      expect(resolved.oilType).toBe("0W-20");
      expect(resolved.oilFilter).toBe("A");
      expect(resolved.oilCapacity).toBeUndefined();
    });
  });

  describe("orderedUnion", () => {
    it("keeps first-seen order and drops blanks and duplicates", () => {
      expect(orderedUnion(["b", null, "a"], ["a", "c", ""], [undefined, "d"])).toEqual([
        "b",
        "a",
        "c",
        "d",
      ]);
    });
  });
});
