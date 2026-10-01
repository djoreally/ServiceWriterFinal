import { isReservedSubdomain, RESERVED_SUBDOMAINS } from "@/lib/reserved-subdomains";

describe("reserved-subdomains", () => {
  it("flags infrastructure labels as reserved", () => {
    for (const label of ["auth", "api", "app", "www", "admin", "mail", "support", "webhook"]) {
      expect(isReservedSubdomain(label)).toBe(true);
    }
  });

  it("matching is case-insensitive and whitespace-tolerant", () => {
    expect(isReservedSubdomain(" Auth ")).toBe(true);
    expect(isReservedSubdomain("API")).toBe(true);
  });

  it("allows ordinary tenant slugs", () => {
    expect(isReservedSubdomain("apex-mobile")).toBe(false);
    expect(isReservedSubdomain("momsoilchange")).toBe(false);
  });

  it("returns false for nullish labels", () => {
    expect(isReservedSubdomain(null)).toBe(false);
    expect(isReservedSubdomain(undefined)).toBe(false);
    expect(isReservedSubdomain("")).toBe(false);
  });

  it("does not partially match (authx is not auth)", () => {
    expect(isReservedSubdomain("authx")).toBe(false);
    expect(isReservedSubdomain("my-auth")).toBe(false);
  });

  it("keeps the OAuth consent host reserved", () => {
    expect(RESERVED_SUBDOMAINS).toContain("auth");
  });
});
