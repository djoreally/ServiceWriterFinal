/**
 * The one professional master layout for every Service Writer email.
 *
 * Visual language: the SocialMetric design system (spec:
 * sw-design-system-socialmetric-2026-10-30.md) adapted to email-safe
 * equivalents — table layout, inline styles, solid colors (email clients
 * drop CSS gradients), system font fallbacks behind Inter / Plus Jakarta
 * Sans. Every renderer (lifecycle registry, delivery renderer, invoice
 * send, invitations, diagnostics) builds on this shell so no email ships
 * with its own ad-hoc markup again.
 */

export const EMAIL_TOKENS = {
  primary: "#1677ff",
  primaryStrong: "#0f5fd8",
  background: "#f7fbff",
  soft: "#f1f7ff",
  surface: "#ffffff",
  border: "#dce7f5",
  text: "#10213f",
  muted: "#667085",
  faint: "#94a3b8",
  navy: "#0f172a",
  headerSubtle: "#cbd5e1",
  success: "#16a34a",
  fontBody: "'Inter',-apple-system,'Segoe UI',Arial,Helvetica,sans-serif",
  fontDisplay: "'Plus Jakarta Sans','Inter',-apple-system,'Segoe UI',Arial,Helvetica,sans-serif",
} as const;

export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export type EmailDetail = {
  /** Omit for a full-width row (used when the source text has no label). */
  label?: string;
  value: string;
};

export type EmailLayoutInput = {
  businessName: string;
  /** Workspace logo when one exists; the wordmark renders otherwise. */
  logoUrl?: string | null;
  /** Small line under the brand in the navy header band. */
  headerSubtitle?: string;
  /** Hidden inbox preview text. */
  preview: string;
  eyebrow?: { text: string; color?: string };
  headline: string;
  /** Plain-text paragraphs; escaped, single newlines become line breaks. */
  introParagraphs?: string[];
  details?: EmailDetail[];
  /** Pre-built, already-escaped section HTML (e.g. an invoice lines table). */
  bodyHtml?: string;
  highlight?: { label: string; value: string; note?: string };
  cta?: { label: string; url: string } | null;
  /** Small paragraph under the CTA (help / next-step copy). */
  helpText?: string;
  /** Shop contact shown in the footer when the flow provides it. */
  contact?: { phone?: string | null; email?: string | null };
  /** Marketing only: preferences / unsubscribe link. */
  preferencesUrl?: string | null;
};

function usableUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

/**
 * Parse the registry's pipe-separated "Label: value | Label: value"
 * essential-information strings into detail rows. A segment only becomes a
 * labeled row when its label is short and digit-free, so values that merely
 * contain a colon (times like "5:00 PM", URLs) stay full-width rows.
 */
export function parseEmailDetails(input: string): EmailDetail[] {
  return input
    .split(/\s*\|\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf(":");
      if (separator <= 0) return { value: part };
      const label = part.slice(0, separator).trim();
      if (!label || label.length > 40 || /\d/.test(label)) return { value: part };
      return { label, value: part.slice(separator + 1).trim() };
    });
}

export function emailDetailRow(detail: EmailDetail): string {
  if (!detail.label) {
    return `<tr><td colspan="2" style="padding:8px 0;color:${EMAIL_TOKENS.text};font-size:14px;line-height:1.5;vertical-align:top">${escapeEmailHtml(detail.value)}</td></tr>`;
  }
  return `<tr><td style="padding:8px 0;color:${EMAIL_TOKENS.muted};font-size:13px;vertical-align:top;width:132px">${escapeEmailHtml(detail.label)}</td><td style="padding:8px 0;color:${EMAIL_TOKENS.text};font-size:14px;font-weight:600;line-height:1.5;vertical-align:top">${escapeEmailHtml(detail.value)}</td></tr>`;
}

export function emailDetailsTable(details: EmailDetail[]): string {
  if (!details.length) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid ${EMAIL_TOKENS.border};border-bottom:1px solid ${EMAIL_TOKENS.border}">${details.map(emailDetailRow).join("")}</table>`;
}

export function emailCtaButton(cta: { label: string; url: string }): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin-top:24px"><tr><td bgcolor="${EMAIL_TOKENS.primary}" style="border-radius:8px"><a href="${escapeEmailHtml(cta.url)}" style="display:inline-block;background:${EMAIL_TOKENS.primary};color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:13px 22px;border-radius:8px">${escapeEmailHtml(cta.label)}</a></td></tr></table>`;
}

function paragraphsHtml(paragraphs: string[]): string {
  return paragraphs
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6">${escapeEmailHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const business = input.businessName.trim() || "Service Writer";
  const logoUrl = usableUrl(input.logoUrl);
  const headerSubtitle = input.headerSubtitle?.trim() || "Powered by Service Writer";
  const brand = logoUrl
    ? `<img src="${escapeEmailHtml(logoUrl)}" alt="${escapeEmailHtml(business)}" style="display:block;max-height:40px;max-width:200px;border:0">`
    : `<div style="font-family:${EMAIL_TOKENS.fontDisplay};font-size:22px;font-weight:800;color:#ffffff">${escapeEmailHtml(business)}</div>`;
  const eyebrow = input.eyebrow?.text
    ? `<p style="margin:0 0 8px;color:${input.eyebrow.color ?? EMAIL_TOKENS.primaryStrong};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">${escapeEmailHtml(input.eyebrow.text)}</p>`
    : "";
  const details = input.details?.length ? emailDetailsTable(input.details) : "";
  const highlight = input.highlight
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0 0;background:${EMAIL_TOKENS.soft};border:1px solid ${EMAIL_TOKENS.border};border-radius:10px"><tr><td style="padding:18px"><div style="font-size:13px;color:${EMAIL_TOKENS.muted}">${escapeEmailHtml(input.highlight.label)}</div><div style="margin-top:4px;font-family:${EMAIL_TOKENS.fontDisplay};font-size:28px;font-weight:800;color:${EMAIL_TOKENS.text}">${escapeEmailHtml(input.highlight.value)}</div>${input.highlight.note ? `<div style="margin-top:6px;font-size:12px;color:${EMAIL_TOKENS.muted}">${escapeEmailHtml(input.highlight.note)}</div>` : ""}</td></tr></table>`
    : "";
  const ctaTarget = input.cta ? (usableUrl(input.cta.url) ?? (input.cta.url.startsWith("/") ? input.cta.url : null)) : null;
  const cta = input.cta && ctaTarget ? emailCtaButton({ label: input.cta.label, url: ctaTarget }) : "";
  const help = input.helpText
    ? `<p style="margin:24px 0 0;color:${EMAIL_TOKENS.muted};font-size:13px;line-height:1.6">${escapeEmailHtml(input.helpText)}</p>`
    : "";
  const contactBits = [input.contact?.phone, input.contact?.email]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
  const contact = contactBits.length
    ? `<div style="margin-bottom:6px;color:${EMAIL_TOKENS.muted};font-size:12px">Contact ${escapeEmailHtml(business)}: ${contactBits.map(escapeEmailHtml).join(" · ")}</div>`
    : "";
  const preferences = usableUrl(input.preferencesUrl)
    ? `<p style="margin:10px 0 0;color:${EMAIL_TOKENS.muted};font-size:12px;line-height:1.5"><a href="${escapeEmailHtml(usableUrl(input.preferencesUrl) as string)}" style="color:${EMAIL_TOKENS.primaryStrong}">Manage email preferences or unsubscribe</a></p>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:${EMAIL_TOKENS.background};color:${EMAIL_TOKENS.text};font-family:${EMAIL_TOKENS.fontBody}"><div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeEmailHtml(input.preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_TOKENS.background}"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:${EMAIL_TOKENS.surface};border:1px solid ${EMAIL_TOKENS.border};border-radius:16px;overflow:hidden"><tr><td style="padding:22px 28px;background:${EMAIL_TOKENS.navy}">${brand}<div style="margin-top:5px;font-size:12px;color:${EMAIL_TOKENS.headerSubtle}">${escapeEmailHtml(headerSubtitle)}</div></td></tr><tr><td style="padding:30px 28px">${eyebrow}<h1 style="margin:0 0 14px;font-family:${EMAIL_TOKENS.fontDisplay};font-size:26px;line-height:1.2;color:${EMAIL_TOKENS.text}">${escapeEmailHtml(input.headline)}</h1>${paragraphsHtml(input.introParagraphs ?? [])}${details}${input.bodyHtml ?? ""}${highlight}${cta}${help}</td></tr><tr><td style="padding:17px 28px;border-top:1px solid ${EMAIL_TOKENS.border}">${contact}<div style="color:${EMAIL_TOKENS.faint};font-size:11px">Sent by ${escapeEmailHtml(business)} · Powered by Service Writer</div>${preferences}</td></tr></table></td></tr></table></body></html>`;
}
