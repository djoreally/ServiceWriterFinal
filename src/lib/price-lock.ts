/**
 * Website quote price lock.
 *
 * Pricing channel rule (Ty, 2026-10-29): the price source follows the booking
 * channel.
 *
 * - Bookings created by staff are priced natively in Service Writer
 *   (service catalog + workspace settings).
 * - Bookings created through the Service Writer booking link carry the
 *   total the booking page showed the customer, locked at creation —
 *   the client quote lock below (Ty, 2026-10-31; this supersedes the
 *   2026-10-29 line that grouped link bookings with native pricing,
 *   whose later catalog-priced insert step proved unreliable).
 * - Bookings pushed from the MOMS website carry the website's quoted total.
 *   That quote is locked: no Service Writer edit, service-line change, status
 *   transition, or invoice sync may re-price it — including website-only deal
 *   prices (e.g. the $89 SOCIAL89 / $99 SOCIAL99 offers), which exist only
 *   inside the website quote.
 *
 * The lock is carried on the appointment itself, written once by the staff
 * push RPC (`public_booking_book_appointment_staff_v1`):
 * - `appointments.source = 'moms_website'` (the pricing channel; write-once)
 * - `appointments.metadata.pricing_state = 'website_quote_locked'`
 * - `appointments.metadata.estimated_cost` (mirrored to
 *   `client_estimated_cost`) holds the locked quote, and the appointment has a
 *   single `appointment_items` row whose unit price is the quote.
 *
 * Every recompute path (PATCH totals merge, primary-service sync, detail-page
 * service lines, the `sync_appointment_invoice_v1` trigger, the detail
 * page's displayed total, the Complete-Appointment closeout collect amount,
 * payment creation, and the mobile appointment card) must check
 * `isWebsiteQuoteLocked` first and leave a locked appointment's money exactly
 * as the website quoted it.
 *
 * Booking-link client quote lock (Ty, 2026-10-31): the same lock, carried by
 * the link channel. A booking made through the Service Writer booking link
 * shows the customer a total before creation (services, extras and fees as
 * computed by the booking page); that shown total is the price. The v3
 * create RPC now writes it at insert — `source = 'public_booking'`,
 * `pricing_state = 'client_quote_locked'`, `estimated_cost` (mirrored to
 * `client_estimated_cost`) holding the quote, one `appointment_items` row
 * whose unit price is the quote (price_source 'client_quote') — because the
 * previous design delegated the money to a later catalog-priced insert
 * step that could fail or be skipped, leaving $0 invoices behind a real
 * quote (INV-97). Recompute paths must check `isClientQuoteLocked` (or the
 * combined `isQuoteLocked`) alongside the website lock and leave a locked
 * link booking's money exactly as the customer was shown it.
 */

export const WEBSITE_QUOTE_SOURCE = "moms_website";
export const WEBSITE_QUOTE_PRICING_STATE = "website_quote_locked";

export interface PriceLockRow {
  source?: unknown;
  metadata?: unknown;
  /**
   * UI appointment shapes (`@/shared/types` Appointment, as produced by the
   * appointment detail/list queries) carry the raw DB metadata under
   * `intake_responses` instead of `metadata`. Both spellings are accepted so
   * callers can pass either shape without re-mapping.
   */
  intake_responses?: unknown;
  /** Detail-shaped rows also mirror the quote onto the top level. */
  estimated_cost?: unknown;
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function lockMetadata(row: PriceLockRow | null | undefined): Record<string, unknown> {
  if (!row) return {};
  const metadata = metadataObject(row.metadata);
  if (Object.keys(metadata).length > 0) return metadata;
  return metadataObject(row.intake_responses);
}

/** Round a dollar amount to cents (half-up), for lock arithmetic. */
export function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * True when the appointment is a website booking whose quoted total is locked.
 * The `website_booking_id` metadata key is accepted as an alternative marker so
 * the lock still holds if a later sync rewrites `pricing_state`.
 */
export function isWebsiteQuoteLocked(row: PriceLockRow | null | undefined): boolean {
  if (!row || row.source !== WEBSITE_QUOTE_SOURCE) return false;
  const metadata = lockMetadata(row);
  return (
    metadata.pricing_state === WEBSITE_QUOTE_PRICING_STATE ||
    typeof metadata.website_booking_id === "string"
  );
}

/** The locked website quote in dollars, or null when the row is not locked. */
export function websiteQuoteTotal(row: PriceLockRow | null | undefined): number | null {
  if (!isWebsiteQuoteLocked(row)) return null;
  const metadata = lockMetadata(row);
  const raw = metadata.estimated_cost ?? metadata.client_estimated_cost ?? row?.estimated_cost;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The amount still to collect on a locked appointment: the stored website
 * quote minus what has already been paid, floored at 0. No workspace fee
 * settings or tax are ever applied on top of the quote. Returns null when
 * the row is not locked (or carries no readable quote), so callers can fall
 * back to their native total computation unchanged.
 */
export function websiteQuoteAmountDue(
  row: PriceLockRow | null | undefined,
  amountPaid: number,
): number | null {
  const quote = websiteQuoteTotal(row);
  if (quote === null) return null;
  const paid = Number.isFinite(amountPaid) && amountPaid > 0 ? amountPaid : 0;
  return Math.max(0, roundToCents(quote - paid));
}

export const CLIENT_QUOTE_SOURCE = "public_booking";
export const CLIENT_QUOTE_PRICING_STATE = "client_quote_locked";

/**
 * True when the appointment is a booking-link booking whose shown total is
 * locked. Unlike the website lock there is no secondary marker: the v3
 * create writes `pricing_state` atomically with the appointment, and the
 * invoice sync's write-back preserves it, so the state alone is the mark.
 */
export function isClientQuoteLocked(row: PriceLockRow | null | undefined): boolean {
  if (!row || row.source !== CLIENT_QUOTE_SOURCE) return false;
  const metadata = lockMetadata(row);
  return metadata.pricing_state === CLIENT_QUOTE_PRICING_STATE;
}

/** True when the appointment carries either channel's quote lock. */
export function isQuoteLocked(row: PriceLockRow | null | undefined): boolean {
  return isWebsiteQuoteLocked(row) || isClientQuoteLocked(row);
}

/** The locked booking-link quote in dollars, or null when not locked. */
export function clientQuoteTotal(row: PriceLockRow | null | undefined): number | null {
  if (!isClientQuoteLocked(row)) return null;
  const metadata = lockMetadata(row);
  const raw = metadata.estimated_cost ?? metadata.client_estimated_cost ?? row?.estimated_cost;
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/** The locked quote in dollars for either channel, or null when not locked. */
export function lockedQuoteTotal(row: PriceLockRow | null | undefined): number | null {
  return websiteQuoteTotal(row) ?? clientQuoteTotal(row);
}
