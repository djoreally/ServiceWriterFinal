/**
 * Serialize JSON-LD for insertion into a `<script type="application/ld+json">` element.
 *
 * JSON.stringify alone does not neutralize HTML parser-sensitive characters. Escaping
 * these values prevents user-controlled structured data from closing the script element
 * and becoming executable markup.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
