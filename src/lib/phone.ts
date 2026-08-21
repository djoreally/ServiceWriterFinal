/**
 * Phone number utilities — normalize, validate, and display-format.
 *
 * The canonical storage/API format is E.164: +15551234567
 * Users may type: (555) 123-4567, 555-123-4567, 5551234567, +1 555 123 4567, etc.
 * These helpers handle conversion automatically.
 */

/**
 * Strip everything except digits and a leading '+'.
 */
function stripNonDigits(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    return "+" + trimmed.slice(1).replace(/\D/g, "");
  }
  return trimmed.replace(/\D/g, "");
}

/**
 * Normalize a user-entered phone string into E.164 format.
 * Assumes US (+1) country code when none is provided.
 *
 * Examples:
 *   "(555) 123-4567"   → "+15551234567"
 *   "555-123-4567"     → "+15551234567"
 *   "5551234567"       → "+15551234567"
 *   "+1 555 123 4567"  → "+15551234567"
 *   "+15551234567"     → "+15551234567"  (no-op)
 *   "+447911123456"    → "+447911123456" (international preserved)
 *   ""                 → ""
 *   "abc"              → ""              (garbage → empty)
 */
export function normalizePhoneToE164(raw: string): string {
  if (!raw) return "";

  const cleaned = stripNonDigits(raw);
  if (!cleaned) return "";

  // Already has country code
  if (cleaned.startsWith("+")) {
    // Validate minimum length (+ plus at least 8 digits)
    const digits = cleaned.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? cleaned : "";
  }

  // US: 10 digits → prepend +1
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  }

  // US: 11 digits starting with 1 → prepend +
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `+${cleaned}`;
  }

  // 7-digit local numbers or other lengths we can't confidently normalize
  return "";
}

/**
 * Validate that a string is a valid E.164 phone number.
 */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Format an E.164 number for display.
 * US numbers (+1XXXXXXXXXX) → (XXX) XXX-XXXX
 * Others → kept as-is with spaces.
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164) return "";

  // US number
  if (e164.startsWith("+1") && e164.length === 12) {
    const area = e164.slice(2, 5);
    const prefix = e164.slice(5, 8);
    const line = e164.slice(8, 12);
    return `(${area}) ${prefix}-${line}`;
  }

  // International — just add spaces for readability
  return e164;
}

/**
 * Auto-format as the user types (for display in input fields).
 * Formats US numbers progressively: 5 → 55 → (555) → (555) 1 → (555) 123-4567
 * Returns the formatted display string — store the E.164 version separately.
 */
export function formatPhoneInput(raw: string): string {
  if (!raw) return "";

  // If they typed a '+', let them type internationally without reformatting
  if (raw.startsWith("+")) {
    return stripNonDigits(raw);
  }

  const digits = raw.replace(/\D/g, "");

  // Strip leading "1" for US formatting when 11 digits
  const usDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (usDigits.length <= 3) return usDigits;
  if (usDigits.length <= 6) return `(${usDigits.slice(0, 3)}) ${usDigits.slice(3)}`;
  return `(${usDigits.slice(0, 3)}) ${usDigits.slice(3, 6)}-${usDigits.slice(6, 10)}`;
}
