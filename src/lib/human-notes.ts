/**
 * Customer-notes cleaning for presentation.
 *
 * Standing rule (Ty): an appointment's Notes show ONLY what the customer
 * entered — never system text. Stored notes on older records can still
 * carry lines the system wrote (the website-push provenance line,
 * Vehicles:/Services:/Payment: summary lines, filter-match blocks, and
 * the composed "… — booked on the MOMS website." description), so every
 * surface that presents stored notes as customer notes runs them through
 * this cleaner first. New writes never put system text in notes at all
 * (see customerNotes in @/lib/website-bookings); this is the display-side
 * guarantee for rows that already exist.
 */
export function cleanHumanNotes(value?: string | null): string {
  if (!value) return "";
  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  let suppressFilterBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }

    if (/^(vehicles?|services?|payment):/i.test(line)) continue;
    // System provenance from the website push ("Pushed from MOMS website
    // booking <id>. Source: website. Website payment status: ...") is not
    // a customer note. Provenance lives in appointment metadata instead.
    if (/^pushed from .*website booking\b/i.test(line)) continue;
    // The composed website-push description ("<service> for <vehicle> —
    // booked on the MOMS website.") is system text, not a customer note,
    // wherever it appears inside a notes value.
    if (/\u2014\s*booked on the .*website\.?$/i.test(line) || /^booked on the .*website\.?$/i.test(line)) continue;
    if (/^filter match\s*\(/i.test(line)) {
      suppressFilterBlock = true;
      continue;
    }
    if (suppressFilterBlock && (/^•?\s*oil filter:/i.test(line) || /^\d{4}\s+/.test(line))) continue;
    suppressFilterBlock = false;
    kept.push(rawLine);
  }

  return kept.join("\n").trim();
}
