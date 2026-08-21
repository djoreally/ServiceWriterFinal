/**
 * SMS segment counting (client mirror of supabase/functions/lib/messaging/segments.ts).
 *
 * One credit = one segment. GSM-7: 160 single / 153 concatenated.
 * UCS-2: 70 single / 67 concatenated.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€";

export function countSmsSegments(message: string): number {
  const text = message ?? "";
  if (!text) return 1;
  let isGsm = true;
  let length = 0;
  for (const ch of text) {
    if (GSM7.includes(ch)) length += 1;
    else if (GSM7_EXT.includes(ch)) length += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (!isGsm) {
    const units = Array.from(text).reduce(
      (acc, ch) => acc + ((ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1),
      0,
    );
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }
  if (length <= 160) return 1;
  return Math.ceil(length / 153);
}
