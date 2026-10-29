import { isWebsiteQuoteLocked, websiteQuoteTotal } from "./price-lock";

const lockedMetadata = {
  pricing_state: "website_quote_locked",
  estimated_cost: 122.57,
  client_estimated_cost: 122.57,
  tax_amount: 0,
  website_booking_id: "e38138f6-de07-4d75-8942-f4ce3d891fc7",
  source_channel: "website /lp/mobile-oil-change-philly",
};

describe("isWebsiteQuoteLocked", () => {
  it("locks a website-pushed appointment carrying the pricing_state marker", () => {
    expect(isWebsiteQuoteLocked({ source: "moms_website", metadata: lockedMetadata })).toBe(true);
  });

  it("still locks when pricing_state was rewritten but the website booking id remains", () => {
    const { pricing_state: _dropped, ...rest } = lockedMetadata;
    expect(isWebsiteQuoteLocked({ source: "moms_website", metadata: rest })).toBe(true);
  });

  it("does not lock native channels even with similar metadata", () => {
    expect(isWebsiteQuoteLocked({ source: "staff", metadata: lockedMetadata })).toBe(false);
    expect(isWebsiteQuoteLocked({ source: "public_booking", metadata: lockedMetadata })).toBe(false);
  });

  it("does not lock a moms_website appointment without any lock marker", () => {
    expect(
      isWebsiteQuoteLocked({ source: "moms_website", metadata: { estimated_cost: 122.57 } }),
    ).toBe(false);
  });

  it("does not lock missing or malformed rows", () => {
    expect(isWebsiteQuoteLocked(null)).toBe(false);
    expect(isWebsiteQuoteLocked(undefined)).toBe(false);
    expect(isWebsiteQuoteLocked({ source: "moms_website", metadata: null })).toBe(false);
    expect(isWebsiteQuoteLocked({ source: "moms_website", metadata: "junk" })).toBe(false);
    expect(isWebsiteQuoteLocked({})).toBe(false);
  });
});

describe("websiteQuoteTotal", () => {
  it("returns the locked quote from estimated_cost", () => {
    expect(websiteQuoteTotal({ source: "moms_website", metadata: lockedMetadata })).toBe(122.57);
  });

  it("falls back to client_estimated_cost", () => {
    const metadata = { ...lockedMetadata };
    delete (metadata as Record<string, unknown>).estimated_cost;
    expect(websiteQuoteTotal({ source: "moms_website", metadata })).toBe(122.57);
  });

  it("returns null for unlocked rows", () => {
    expect(websiteQuoteTotal({ source: "staff", metadata: lockedMetadata })).toBeNull();
    expect(websiteQuoteTotal(null)).toBeNull();
  });
});
