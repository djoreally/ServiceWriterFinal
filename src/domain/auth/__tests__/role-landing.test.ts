import { describe, expect, it } from "@jest/globals";
import { roleLandingPath } from "@/domain/auth/role-landing";
import type { WorkforceRole } from "@/application/queries/workforce-identity.query";

describe("roleLandingPath", () => {
  it.each<[WorkforceRole, string]>([
    ["admin", "/dashboard"],
    ["owner", "/dashboard"],
    ["viewer", "/dashboard"],
    ["manager", "/dispatch"],
    ["dispatcher", "/dispatch"],
    ["service_advisor", "/dispatch"],
    ["receptionist", "/dispatch"],
    ["fleet_manager", "/fleet-os"],
    ["technician", "/tech-app"],
  ])("routes %s to %s", (role, expected) => {
    expect(roleLandingPath(role)).toBe(expected);
  });
});
