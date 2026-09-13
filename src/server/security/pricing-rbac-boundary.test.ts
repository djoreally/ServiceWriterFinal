import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("pricing RBAC boundary", () => {
  const migration = read("supabase/migrations/20260911110000_pricing_rbac_boundary.sql");

  it("replaces broad workspace-writer pricing policies", () => {
    expect(migration).toContain("tire_pricing_manager_insert");
    expect(migration).toContain("tire_pricing_manager_update");
    expect(migration).toContain("tire_pricing_manager_delete");
    expect(migration).toContain("detailing_pricing_manager_insert");
    expect(migration).toContain("detailing_pricing_manager_update");
    expect(migration).toContain("detailing_pricing_manager_delete");
  });

  it("requires explicit pricing-management roles", () => {
    expect(migration).toContain(
      "array['owner','admin','manager','service_advisor']::public.member_role[]",
    );
    expect(migration).toContain("Pricing management permission required");
  });

  it("removes is_workspace_writer from detailing mutation authority", () => {
    expect(migration).not.toContain(
      "not public.is_workspace_writer",
    );
  });
});
