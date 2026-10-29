/**
 * Website quote price lock.
 *
 * Pricing channel rule (Ty, 2026-10-29): the price source follows the booking
 * channel.
 *
 * - Bookings created through the Service Writer booking link or by staff are
 *   priced natively in Service Writer (service catalog + workspace settings).
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
