import { mapOperationalSourceToJobSource } from "@/lib/job-thread-source";

describe("mapOperationalSourceToJobSource", () => {
  it("maps supported sources", () => {
    expect(mapOperationalSourceToJobSource("appointment")).toBe("appointment");
    expect(mapOperationalSourceToJobSource("fleet_work_order")).toBe("fleet_work_order");
  });

  it("returns null for unknown or empty sources", () => {
    expect(mapOperationalSourceToJobSource("other")).toBeNull();
    expect(mapOperationalSourceToJobSource("")).toBeNull();
    expect(mapOperationalSourceToJobSource(null)).toBeNull();
    expect(mapOperationalSourceToJobSource(undefined)).toBeNull();
  });
});
