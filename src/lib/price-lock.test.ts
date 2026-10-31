import {
  clientQuoteTotal,
  isClientQuoteLocked,
  isQuoteLocked,
  isWebsiteQuoteLocked,
  lockedQuoteTotal,
  websiteQuoteAmountDue,
  websiteQuoteTotal,
} from "./price-lock";
import { computeAppointmentTotal } from "./appointmentTotal";

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

describe("UI-shaped rows (source + intake_responses)", () => {
  // AppointmentDetail, the appointments list and the mobile card all carry
  // the raw DB metadata on `intake_responses`, not `metadata`.
  const uiRow = { source: "moms_website", intake_responses: lockedMetadata };

  it("locks and reads the quote from intake_responses", () => {
    expect(isWebsiteQuoteLocked(uiRow)).toBe(true);
    expect(websiteQuoteTotal(uiRow)).toBe(122.57);
  });

  it("does not lock a native UI row", () => {
    expect(isWebsiteQuoteLocked({ source: "staff", intake_responses: lockedMetadata })).toBe(false);
    expect(websiteQuoteTotal({ source: "staff", intake_responses: lockedMetadata })).toBeNull();
  });

  it("card display value: the stored quote, not the fee-loaded helper total", () => {
    // The fee-loaded helper applies workspace fees on top of the service
    // lines: a single line at the $122.57 quote + $4 waste fee + 3%
    // surcharge is the exact inflation pattern from the Oct 2026 scar.
    const cardRow = {
      ...uiRow,
      estimated_cost: 122.57,
      appointment_services: [{ price: 122.57, quantity: 1 }],
    };
    const feeLoaded = computeAppointmentTotal(cardRow, {
      waste_oil_fee_enabled: true,
      waste_oil_fee: 4,
      surcharge_enabled: true,
      surcharge_type: "percentage",
      surcharge_value: 3,
    });
    expect(feeLoaded).toBeGreaterThan(122.57);
    expect(websiteQuoteTotal(cardRow)).toBe(122.57);
  });
});

describe("websiteQuoteAmountDue (closeout collect amount)", () => {
  const row = { source: "moms_website", metadata: lockedMetadata };

  it("is the full quote when nothing has been paid", () => {
    expect(websiteQuoteAmountDue(row, 0)).toBe(122.57);
  });

  it("is quote minus amount already paid", () => {
    expect(websiteQuoteAmountDue(row, 30)).toBe(92.57);
    expect(websiteQuoteAmountDue(row, 122.57)).toBe(0);
  });

  it("floors at 0 when more than the quote was paid", () => {
    expect(websiteQuoteAmountDue(row, 200)).toBe(0);
  });

  it("applies no fee settings on top of the quote", () => {
    // The due amount is derived from the quote alone; the $4 + 3% pattern
    // would produce $130.37 on a $122.57 quote — never the locked answer.
    expect(websiteQuoteAmountDue(row, 0)).not.toBe(130.37);
    expect(websiteQuoteAmountDue(row, 0)).toBe(122.57);
  });

  it("returns null for unlocked rows so native totals stay in charge", () => {
    expect(websiteQuoteAmountDue({ source: "staff", metadata: lockedMetadata }, 0)).toBeNull();
    expect(websiteQuoteAmountDue(null, 0)).toBeNull();
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

describe("booking-link client quote lock", () => {
  const clientLockedMetadata = {
    pricing_state: "client_quote_locked",
    estimated_cost: 137,
    client_estimated_cost: 137,
    tax_amount: 0,
  };

  it("locks a link booking carrying the client_quote_locked marker", () => {
    expect(isClientQuoteLocked({ source: "public_booking", metadata: clientLockedMetadata })).toBe(true);
  });

  it("does not lock a link booking still pending canonical items", () => {
    expect(
      isClientQuoteLocked({
        source: "public_booking",
        metadata: { pricing_state: "pending_canonical_items", estimated_cost: 0, client_estimated_cost: 137 },
      }),
    ).toBe(false);
  });

  it("does not lock other channels carrying the client marker", () => {
    expect(isClientQuoteLocked({ source: "moms_website", metadata: clientLockedMetadata })).toBe(false);
    expect(isClientQuoteLocked({ source: "staff", metadata: clientLockedMetadata })).toBe(false);
  });

  it("does not lock missing or malformed rows", () => {
    expect(isClientQuoteLocked(null)).toBe(false);
    expect(isClientQuoteLocked(undefined)).toBe(false);
    expect(isClientQuoteLocked({ source: "public_booking", metadata: null })).toBe(false);
    expect(isClientQuoteLocked({})).toBe(false);
  });

  it("isQuoteLocked covers either channel's lock and nothing else", () => {
    expect(isQuoteLocked({ source: "moms_website", metadata: lockedMetadata })).toBe(true);
    expect(isQuoteLocked({ source: "public_booking", metadata: clientLockedMetadata })).toBe(true);
    expect(isQuoteLocked({ source: "staff", metadata: {} })).toBe(false);
    expect(isQuoteLocked(null)).toBe(false);
  });

  it("clientQuoteTotal returns the locked quote from estimated_cost", () => {
    expect(clientQuoteTotal({ source: "public_booking", metadata: clientLockedMetadata })).toBe(137);
  });

  it("clientQuoteTotal falls back to client_estimated_cost", () => {
    const { estimated_cost: _dropped, ...rest } = clientLockedMetadata;
    expect(clientQuoteTotal({ source: "public_booking", metadata: rest })).toBe(137);
  });

  it("clientQuoteTotal returns null for unlocked rows", () => {
    expect(clientQuoteTotal({ source: "public_booking", metadata: {} })).toBeNull();
    expect(clientQuoteTotal({ source: "staff", metadata: clientLockedMetadata })).toBeNull();
  });

  it("lockedQuoteTotal reads the quote for whichever lock the row carries", () => {
    expect(lockedQuoteTotal({ source: "moms_website", metadata: lockedMetadata })).toBe(122.57);
    expect(lockedQuoteTotal({ source: "public_booking", metadata: clientLockedMetadata })).toBe(137);
    expect(lockedQuoteTotal({ source: "staff", metadata: {} })).toBeNull();
  });
});
