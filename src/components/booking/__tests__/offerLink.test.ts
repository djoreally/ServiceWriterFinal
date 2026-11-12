import { describe, it, expect } from "vitest";
import { normalizeOfferCode, parseLinkedOfferCode } from "../offerLink";

describe("parseLinkedOfferCode", () => {
  it("reads the offer param the website's links carry", () => {
    expect(parseLinkedOfferCode("?offer=SOCIAL89")).toBe("SOCIAL89");
  });

  it("uppercases a lowercase code, like the coupon box does", () => {
    expect(parseLinkedOfferCode("?offer=social89")).toBe("SOCIAL89");
  });

  it("falls back to the coupon param", () => {
    expect(parseLinkedOfferCode("?coupon=FIRST20")).toBe("FIRST20");
  });

  it("prefers offer over coupon when both are present", () => {
    expect(parseLinkedOfferCode("?coupon=OTHER&offer=WIPERS119")).toBe("WIPERS119");
  });

  it("ignores unrelated params and finds the offer among them", () => {
    expect(parseLinkedOfferCode("?utm_source=fb&offer=99")).toBe("99");
  });

  it("decodes URL-encoded values", () => {
    expect(parseLinkedOfferCode("?offer=SOCIAL%2089")).toBe("SOCIAL 89");
  });

  it("returns null when the link carries no offer", () => {
    expect(parseLinkedOfferCode("?utm_source=fb")).toBeNull();
    expect(parseLinkedOfferCode("")).toBeNull();
    expect(parseLinkedOfferCode("?offer=")).toBeNull();
    expect(parseLinkedOfferCode("?offer=%20%20")).toBeNull();
  });

  it("keeps a phone-like value exactly as typed (loyalty path)", () => {
    expect(parseLinkedOfferCode("?offer=555-123-4567")).toBe("555-123-4567");
  });
});

describe("normalizeOfferCode", () => {
  it("trims and uppercases codes", () => {
    expect(normalizeOfferCode("  wipers119 ")).toBe("WIPERS119");
  });

  it("leaves phone-like values untouched apart from trimming", () => {
    expect(normalizeOfferCode(" (555) 123-4567 ")).toBe("(555) 123-4567");
  });
});
