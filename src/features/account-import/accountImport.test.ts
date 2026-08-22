import { canCommitAccountImport, parseAccountExport, planAccountImport } from "./accountImport";

const sourceExport = {
  exportDate: "2026-08-22T20:15:23.513Z",
  userId: "425ce961-9bfe-4d25-94a7-483b3d6eba61",
  email: "owner@example.com",
  exportVersion: "1.1",
  data: {
    business_profiles: [{ id: "aa29af95-5bf5-4d50-88dd-17b7fbcdb09a", business_name: "Example" }],
    customers: [
      { id: "1d6784ce-c672-4d30-a623-8bc417b60023", email: "same@example.com", name: "One" },
      { id: "0c30d337-9caf-4bee-9fce-ef7d20efa163", email: "SAME@example.com", name: "Two" },
    ],
    vehicles: [{ id: "8e04bcb8-6991-460f-b59f-0f7fd05d37e4", customer_id: "1d6784ce-c672-4d30-a623-8bc417b60023" }],
    marketing_campaigns: [{ id: "dd6b1e75-372f-4428-b215-45cfbb429622" }],
  },
};

describe("account import planner", () => {
  it("accepts the supported account-export envelope", () => {
    const result = parseAccountExport(sourceExport);
    expect(result.exportData).toBeDefined();
    expect(result.issues).toHaveLength(0);
  });

  it("requires a destination workspace and reports source rows without workspace ownership", () => {
    const parsed = parseAccountExport(sourceExport);
    const plan = planAccountImport(parsed.exportData!, "00000000-0000-0000-0000-000000000001");
    expect(plan.targetWorkspaceId).toBe("00000000-0000-0000-0000-000000000001");
    expect(plan.issues.some((item) => item.code === "missing_workspace_id")).toBe(true);
    expect(plan.issues.some((item) => item.code === "duplicate_customer_email")).toBe(true);
  });

  it("blocks commit when a source row has no stable id", () => {
    const parsed = parseAccountExport({ ...sourceExport, data: { ...sourceExport.data, customers: [{ email: "bad@example.com" }] } });
    const plan = planAccountImport(parsed.exportData!, "00000000-0000-0000-0000-000000000001");
    expect(plan.totals.errors).toBe(1);
    expect(canCommitAccountImport(plan)).toBe(false);
  });

  it("does not permit an invalid workspace id to become an import target", () => {
    const parsed = parseAccountExport(sourceExport);
    const plan = planAccountImport(parsed.exportData!, "not-a-uuid");
    expect(plan.issues.some((item) => item.code === "invalid_workspace" && item.severity === "error")).toBe(true);
    expect(canCommitAccountImport(plan)).toBe(false);
  });
});
