/**
 * T-15 (redesign truth table): a placeholder email is not a customer email.
 * Website pushes for customers who gave no email have historically stored a
 * system/role address (the shop's own support inbox) on the customer record;
 * rendering it as the customer's address — or worse, as a mailto — sends the
 * shop's mail to itself and hides the fact that the customer is unreachable.
 *
 * Interim client rule until B8 lands server-composed contact flags
 * (has_phone / has_real_email): role inboxes are never a customer's personal
 * email. Returns the email to display, or null → render "No email on file".
 */
const ROLE_LOCAL_PARTS = new Set([
  "support",
  "info",
  "admin",
  "administrator",
  "contact",
  "hello",
  "noreply",
  "no-reply",
  "donotreply",
  "placeholder",
  "none",
  "null",
]);

export function realCustomerEmail(email: string | null | undefined): string | null {
  const value = (email ?? "").trim();
  if (!value || !value.includes("@")) return null;
  const local = value.slice(0, value.indexOf("@")).toLowerCase();
  if (ROLE_LOCAL_PARTS.has(local)) return null;
  return value;
}
