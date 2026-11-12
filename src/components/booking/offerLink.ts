// Offer links: a customer arriving from an offer link carries the offer in
// the URL (?offer=CODE — the same param the MOMS website's /book page reads,
// with ?coupon= accepted as a fallback). The booking flow reads the code out
// of the link and applies it through the normal coupon validation instead of
// making the customer retype it into the coupon box.

const PHONE_LIKE = /^[\d\s\-().+]+$/;

// Mirror the coupon box's own normalization (see CouponRedemption's input
// onChange): codes are uppercased, but a value that looks like a phone
// number is kept exactly as typed, because the same box doubles as the
// loyalty phone-number entry.
export function normalizeOfferCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return PHONE_LIKE.test(trimmed) ? trimmed : trimmed.toUpperCase();
}

// Pull the offer code out of a URL query string. Returns null when the link
// carries no offer, so plain arrivals keep today's exact behavior.
export function parseLinkedOfferCode(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search);
  for (const key of ["offer", "coupon"]) {
    const raw = params.get(key);
    if (raw && raw.trim()) return normalizeOfferCode(raw);
  }
  return null;
}
