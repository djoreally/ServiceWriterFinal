import { getTeamOsModule, getTeamOsPath, isTeamOsModule } from "../team-os-routes";

describe("Team OS navigation", () => {
  it("preserves technician, module, search, and attention context", () => {
    expect(getTeamOsPath({
      module: "compliance",
      technicianId: "tech-1",
      query: "  alex ",
      attentionOnly: true,
      rosterState: "linked",
    })).toBe("/team-os?module=compliance&tech=tech-1&q=alex&attention=1&state=linked");
  });

  it("normalizes unsupported modules to overview", () => {
    expect(getTeamOsModule("unknown")).toBe("overview");
    expect(getTeamOsModule(null)).toBe("overview");
    expect(isTeamOsModule("schedule")).toBe(true);
  });
});
