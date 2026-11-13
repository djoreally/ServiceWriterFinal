/**
 * Contract for the plate-lookup door (plate-decode build, 2026-11-11):
 * POST /v1/vin/plate-lookup in src/server/hono/routes/vehicles.ts.
 *
 * The route was a dead stub (501 "carfax-quickvin") left by the Hono
 * migration. The build revives it on the provider the old decoder
 * actually ran on — Vehicle Databases, behind the
 * VEHICLE_DATABASES_API_KEY secret the old VehicleSpecs screen names
 * in its own toast. The handler must:
 * - register exactly once and keep its requireAuth mounting (the
 *   sibling vin routes are auth-mounted too),
 * - read the key from process.env, never a hardcoded value,
 * - answer a missing key as 200 + integrationUnavailable (the house
 *   contract the VehicleSpecs caller and the CARFAX query both read),
 * - delegate to the Vehicle Databases provider module,
 * - never again answer with the dead carfax-quickvin stub.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/vehicles.ts"),
  "utf8",
);

function handlerBlock(): string {
  const start = SOURCE.indexOf('vehiclesRouter.post("/v1/vin/plate-lookup"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("vehiclesRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("POST /v1/vin/plate-lookup — registration + auth", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/vehiclesRouter\.post\("\/v1\/vin\/plate-lookup"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("keeps the requireAuth mounting of its sibling vin routes", () => {
    expect(handlerBlock()).toContain("await requireAuth(c)");
  });

  it("is no longer the dead carfax-quickvin stub", () => {
    expect(SOURCE).not.toContain('providerUnavailable("carfax-quickvin")');
  });
});

describe("POST /v1/vin/plate-lookup — provider contract", () => {
  it("reads the Vehicle Databases key from the environment", () => {
    expect(handlerBlock()).toContain("process.env.VEHICLE_DATABASES_API_KEY");
  });

  it("answers a missing key as 200 with integrationUnavailable", () => {
    const block = handlerBlock();
    expect(block).toContain("integrationUnavailable: true");
    expect(block).toContain('"Plate lookup is not configured"');
    expect(block).not.toContain("providerUnavailable");
  });

  it("delegates to the Vehicle Databases provider module", () => {
    expect(handlerBlock()).toContain("decodePlateWithVehicleDatabases(");
    expect(SOURCE).toContain('from "@/server/hono/lib/vehicle-databases"');
  });
});
