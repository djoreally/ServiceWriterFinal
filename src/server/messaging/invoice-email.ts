import {
  emailDetailsTable,
  escapeEmailHtml,
  renderEmailLayout,
  EMAIL_TOKENS,
} from "@/server/messaging/email-layout";

export type InvoiceEmailLine = {
  description: string;
  quantity: string;
  /** Pre-formatted by the caller (each route keeps its own money format). */
  unitPrice: string;
  /** Pre-formatted by the caller. */
  amount: string;
};

/**
 * HTML for the staff "send invoice" email (invoice send dialog). Both route
 * implementations (Hono documents router and the Next invoices route) build
 * through here so the customer always gets the one professional design;
 * subject and plain text stay owned by the routes.
 */
export function buildInvoiceSendEmailHtml(input: {
  businessName: string;
  intro: string;
  invoiceNumber: string;
  lines: InvoiceEmailLine[];
  subtotal: string;
  tax: string;
  total: string;
  paid: string;
  balanceDue: string;
  isPaid: boolean;
}): string {
  const rows = input.lines.length
    ? input.lines.map((line) => `<tr><td style="padding:9px 10px 9px 0;color:${EMAIL_TOKENS.text};font-size:14px;line-height:1.5">${escapeEmailHtml(line.description)}</td><td align="center" style="padding:9px 6px;color:${EMAIL_TOKENS.muted};font-size:14px">${escapeEmailHtml(line.quantity)}</td><td align="right" style="padding:9px 6px;color:${EMAIL_TOKENS.muted};font-size:14px">${escapeEmailHtml(line.unitPrice)}</td><td align="right" style="padding:9px 0 9px 6px;color:${EMAIL_TOKENS.text};font-size:14px;font-weight:600">${escapeEmailHtml(line.amount)}</td></tr>`).join("")
    : `<tr><td colspan="4" style="padding:9px 0;color:${EMAIL_TOKENS.muted};font-size:14px">No line items</td></tr>`;
  const linesTable = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:6px"><thead><tr><th align="left" style="padding:0 10px 8px 0;color:${EMAIL_TOKENS.muted};font-size:12px;letter-spacing:.06em;text-transform:uppercase">Description</th><th align="center" style="padding:0 6px 8px;color:${EMAIL_TOKENS.muted};font-size:12px;letter-spacing:.06em;text-transform:uppercase">Qty</th><th align="right" style="padding:0 6px 8px;color:${EMAIL_TOKENS.muted};font-size:12px;letter-spacing:.06em;text-transform:uppercase">Rate</th><th align="right" style="padding:0 0 8px 6px;color:${EMAIL_TOKENS.muted};font-size:12px;letter-spacing:.06em;text-transform:uppercase">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
  const totals = emailDetailsTable([
    { label: "Subtotal", value: input.subtotal },
    { label: "Tax", value: input.tax },
    { label: "Total", value: input.total },
    { label: "Paid", value: input.paid },
    { label: "Balance due", value: input.balanceDue },
  ]);
  return renderEmailLayout({
    businessName: input.businessName,
    preview: `Invoice ${input.invoiceNumber} from ${input.businessName} — ${input.isPaid ? "paid in full" : `balance due ${input.balanceDue}`}`,
    eyebrow: { text: input.isPaid ? "PAID IN FULL" : "INVOICE", color: input.isPaid ? EMAIL_TOKENS.success : EMAIL_TOKENS.primaryStrong },
    headline: `Invoice ${input.invoiceNumber}`,
    introParagraphs: input.intro.split(/\n\s*\n/),
    bodyHtml: `${linesTable}<div style="margin-top:14px">${totals}</div>`,
  });
}
