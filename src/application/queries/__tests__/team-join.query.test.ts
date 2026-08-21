import { describe, expect, it } from "@jest/globals";
import { buildTeamJoinRedirectUrl } from "@/application/queries/team-join.query";

describe("buildTeamJoinRedirectUrl", () => {
  it("uses the canonical invite route when no token is available", () => {
    expect(buildTeamJoinRedirectUrl("https://app.example.com")).toBe("https://app.example.com/invite");
  });
  it("encodes a token in the canonical invite path", () => {
    expect(buildTeamJoinRedirectUrl("https://app.example.com", "abc+/=?")).toBe("https://app.example.com/invite/abc%2B%2F%3D%3F");
  });
});
