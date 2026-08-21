/**
 * XSS Protection utilities
 *
 * Enterprise security: never trust user input. Sanitize before rendering HTML.
 * Use these helpers anywhere user-provided content might be rendered as HTML.
 */

/**
 * Escape HTML special characters to prevent XSS.
 * Use for rendering user content in text nodes.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip all HTML tags from a string.
 * Use when you only want plain text from user input.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize a URL to prevent javascript: and data: XSS vectors.
 * Returns '#' for unsafe URLs.
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, window.location.origin);
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
      return url;
    }
    return '#';
  } catch {
    return '#';
  }
}

/**
 * Validate that a value is a safe plain string (no HTML, no script).
 */
export function isSafeString(value: string): boolean {
  return !/[<>"'`]/.test(value);
}

/**
 * Truncate and strip HTML for safe display in previews.
 */
export function safePreview(input: string, maxLength = 200): string {
  return stripHtml(input).slice(0, maxLength);
}
