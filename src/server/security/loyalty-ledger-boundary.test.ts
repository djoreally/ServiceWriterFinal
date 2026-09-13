import fs from "node:fs";
import path from "node:path";

function read(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("loyalty ledger boundary", () => {
  const migration = read("supabase/migrations/20260911150000_loyalty_ledger_boundary.sql");

  it("removes browser mutation privileges from loyalty history", () => {
    expect(migration).toContain(
      "revoke insert, update, delete on table public.crm_loyalty_ledger from authenticated",
    );
    expect(migration).toContain(
      "drop policy if exists crm_loyalty_ledger_insert on public.crm_loyalty_ledger",
    );
  });

  it("preserves authorized reads and service-role writes", () => {
    expect(migration).toContain(
      "grant select on table public.crm_loyalty_ledger to authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update, delete on table public.crm_loyalty_ledger to service_role",
    );
  });
});
