import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("service package RBAC boundary", () => {
  const migration = read("supabase/migrations/20260911100000_service_package_rbac_boundary.sql");

  it("does not use generic workspace membership for package writes", () => {
    expect(migration).not.toContain(
      "with check (public.is_workspace_member(workspace_id))",
    );
    expect(migration).toContain("service_packages_manager_insert");
    expect(migration).toContain("service_packages_manager_update");
    expect(migration).toContain("service_packages_manager_delete");
  });

  it("requires catalog-management roles for package RPCs", () => {
    expect(migration).toContain(
      "array['owner','admin','manager','service_advisor']::public.member_role[]",
    );
    expect(migration).toContain("Catalog management permission required");
    expect(migration).toContain("public.upsert_service_package");
    expect(migration).toContain("public.populate_workspace_service_packages");
  });

  it("keeps package reads available to authenticated workspace members", () => {
    const source = read("supabase/migrations/20260901162000_canonical_service_packages.sql");
    expect(source).toContain(
      "service_packages_member_select",
    );
  });
});
