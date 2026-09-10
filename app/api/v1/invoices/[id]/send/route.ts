import { z } from "zod";
import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { createSupabaseAdminClient } from "@/lib/supabase";

const bodySchema = z.object({
  workspace_id: z.string().uuid(),
  recipient_email: z.string().email().optional(),
  subject: z.string().trim().max(200).optional(),
  message: z.string().trim().max(10000).optional(),
});

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value: unknown, currency = "USD"): string {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { style: "currency", currency })
    : String(value ?? "");
}

function lineAmount(quantity: unknown, unitPrice: unknown): number {
  const qty = Number(quantity ?? 0);
  const rate = Number(unitPrice ?? 0);
  return Number.isFinite(qty) && Number.isFinite(rate) ? Number((qty * rate).toFixed(2)) : 0;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const invoiceId = z.string().uuid().parse((await context.params).id);
    const body = bodySchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(
      body.workspace_id,
      ["owner", "admin", "manager", "service_advisor", "receptionist"],
      request,
    );

    const [{ data: invoice, error: invoiceError }, { data: workspace, error: workspaceError }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id,workspace_id,invoice_number,status,subtotal,tax_total,total,amount_paid,due_at,metadata,invoice_lines(description,quantity,unit_price,sort_order),customers(id,first_name,last_name,email)")
        .eq("workspace_id", body.workspace_id)
        .eq("id", invoiceId)
        .single(),
      supabase
        .from("workspaces")
        .select("name,currency_code")
        .eq("id", body.workspace_id)
        .single(),
    ]);

    if (invoiceError || !invoice) throw invoiceError ?? new Error("Invoice not found");
    if (workspaceError || !workspace) throw workspaceError ?? new Error("Workspace not found");
    if (invoice.status === "void") {
      return json({ error: { code: "invoice_void", message: "A void invoice cannot be sent." } }, { status: 409 });
    }

    const metadata = object(invoice.metadata);
    const customer = Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers;
    const recipient = body.recipient_email ?? text(metadata.contact_email) ?? customer?.email ?? null;
    if (!recipient) {
      return json({ error: { code: "customer_email_required", message: "Recipient email is required to send this invoice." } }, { status: 422 });
    }

    const customerName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ")
      || text(metadata.contact_name)
      || "Customer";
    const currency = workspace.currency_code || "USD";
    const total = Math.max(0, Number(invoice.total) || 0);
    const paid = Math.max(0, Number(invoice.amount_paid) || 0);
    const balance = Math.max(0, Number((total - paid).toFixed(2)));
    const isPaid = invoice.status === "paid" || balance < 0.01;
    const isPartial = !isPaid && paid > 0;

    const defaultSubject = isPaid
      ? `Paid invoice ${invoice.invoice_number} from ${workspace.name}`
      : isPartial
        ? `Invoice ${invoice.invoice_number} — ${money(balance, currency)} remaining`
        : `Invoice ${invoice.invoice_number} from ${workspace.name} — ${money(total, currency)}`;
    const subject = body.subject?.trim() || defaultSubject;

    const defaultMessage = isPaid
      ? `Hi ${customerName},\n\nThis invoice is paid in full. Here is your final invoice for your records.\n\nThanks,\n${workspace.name}`
      : isPartial
        ? `Hi ${customerName},\n\nWe received ${money(paid, currency)} toward invoice ${invoice.invoice_number}. The remaining balance is ${money(balance, currency)}.\n\nThanks,\n${workspace.name}`
        : `Hi ${customerName},\n\nPlease find invoice ${invoice.invoice_number} below. Let us know if you have any questions.\n\nThanks,\n${workspace.name}`;
    const intro = body.message?.trim() || defaultMessage;

    const lines = [...(invoice.invoice_lines ?? [])].sort(
      (a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0),
    );
    const lineText = lines.length
      ? lines.map((line) => `${line.description} — ${line.quantity} × ${money(line.unit_price, currency)} = ${money(lineAmount(line.quantity, line.unit_price), currency)}`).join("\n")
      : "No line items";

    const paymentSummary = isPaid
      ? `Paid: ${money(paid, currency)}\nBalance due: ${money(0, currency)}\nStatus: PAID IN FULL`
      : isPartial
        ? `Paid: ${money(paid, currency)}\nBalance due: ${money(balance, currency)}`
        : `Balance due: ${money(balance, currency)}`;
    const dueText = !isPaid && invoice.due_at
      ? `\nDue: ${new Date(invoice.due_at).toLocaleDateString("en-US")}`
      : "";
    const plainText = `${intro}\n\nInvoice ${invoice.invoice_number}\n${lineText}\n\nSubtotal: ${money(invoice.subtotal, currency)}\nTax: ${money(invoice.tax_total, currency)}\nTotal: ${money(total, currency)}\n${paymentSummary}${dueText}`;

    const rowsHtml = lines.length
      ? lines.map((line) => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb">${escapeHtml(line.description)}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(line.quantity)}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(money(line.unit_price, currency))}</td><td style="padding:10px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(money(lineAmount(line.quantity, line.unit_price), currency))}</td></tr>`).join("")
      : `<tr><td colspan="4" style="padding:12px 8px">No line items</td></tr>`;

    const statusHtml = isPaid
      ? `<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #d1d5db;border-radius:8px;font-weight:700">PAID IN FULL</div>`
      : isPartial
        ? `<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #d1d5db;border-radius:8px"><strong>${escapeHtml(money(paid, currency))} paid</strong><br><span>${escapeHtml(money(balance, currency))} remaining</span></div>`
        : "";

    const html = `<!doctype html><html><body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#111827"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden"><div style="padding:24px;border-bottom:1px solid #e5e7eb"><div style="font-size:13px;color:#6b7280">${escapeHtml(workspace.name)}</div><h1 style="margin:6px 0 0;font-size:24px">Invoice ${escapeHtml(invoice.invoice_number)}</h1></div><div style="padding:24px">${statusHtml}<div style="white-space:pre-line;line-height:1.6;margin-bottom:24px">${escapeHtml(intro).replaceAll("\n", "<br>")}</div><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr><th style="padding:10px 8px;text-align:left;border-bottom:2px solid #111827">Item</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Qty</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Rate</th><th style="padding:10px 8px;text-align:right;border-bottom:2px solid #111827">Amount</th></tr></thead><tbody>${rowsHtml}</tbody></table><div style="margin-top:20px;margin-left:auto;max-width:300px"><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Subtotal</span><strong>${escapeHtml(money(invoice.subtotal, currency))}</strong></div><div style="display:flex;justify-content:space-between;padding:5px 0"><span>Tax</span><strong>${escapeHtml(money(invoice.tax_total, currency))}</strong></div><div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #111827"><span>Total</span><strong>${escapeHtml(money(total, currency))}</strong></div>${paid > 0 ? `<div style="display:flex;justify-content:space-between;padding:5px 0"><span>Paid</span><strong>${escapeHtml(money(paid, currency))}</strong></div>` : ""}<div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #d1d5db;font-size:18px"><span>Balance due</span><strong>${escapeHtml(money(isPaid ? 0 : balance, currency))}</strong></div>${!isPaid && invoice.due_at ? `<div style="text-align:right;color:#6b7280;font-size:13px">Due ${escapeHtml(new Date(invoice.due_at).toLocaleDateString("en-US"))}</div>` : ""}</div></div></div></div></body></html>`;

    const idempotencyKey = `invoice-send:${invoice.id}:${Date.now()}:${crypto.randomUUID()}`;
    const sendRequest = {
      workspaceId: body.workspace_id,
      recipient: { email: recipient },
      purpose: "transactional" as const,
      templateKey: isPaid ? "paid_invoice" : "manual_invoice",
      subject,
      body: plainText,
      html,
      fromName: workspace.name,
      idempotencyKey,
      metadata: { invoiceId: invoice.id, invoiceStatus: String(invoice.status), balance: balance.toFixed(2) },
    };

    let sent;
    try {
      sent = await new ResendEmailAdapter().send(sendRequest);
    } catch (primaryError) {
      if (!process.env.ENGINEMAILER_API_KEY?.trim()) throw primaryError;
      sent = await new EnginemailerEmailAdapter().send(sendRequest);
    }

    const sentAt = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const { error: logError } = await admin.from("message_logs").insert({
      workspace_id: body.workspace_id,
      customer_id: customer?.id ?? null,
      channel: "email",
      purpose: "transactional",
      provider: sent.providerName,
      idempotency_key: idempotencyKey,
      recipient_email: recipient.toLowerCase(),
      template_key: sendRequest.templateKey,
      subject,
      body_redacted: plainText.slice(0, 240),
      status: sent.status,
      provider_message_id: sent.providerMessageId,
      sent_at: sent.acceptedAt || sentAt,
      consent_checked_at: sentAt,
      suppression_checked_at: sentAt,
      metadata: { invoiceId: invoice.id, source: "invoice_send_dialog", invoiceStatus: invoice.status, amountPaid: paid, balanceDue: balance },
    });
    if (logError) console.error("[invoice-send] email sent but message log write failed", logError);

    const nextStatus = invoice.status === "draft" ? "issued" : invoice.status;
    const nextMetadata = {
      ...metadata,
      last_sent_at: sentAt,
      last_sent_to: recipient.toLowerCase(),
      last_sent_provider: sent.providerName,
      last_sent_provider_message_id: sent.providerMessageId,
    };
    const invoicePatch: Record<string, unknown> = {
      status: nextStatus,
      metadata: nextMetadata,
      updated_at: sentAt,
    };
    if (invoice.status === "draft") invoicePatch.issued_at = sentAt;

    const { error: invoiceUpdateError } = await (supabase.from("invoices") as any)
      .update(invoicePatch)
      .eq("workspace_id", body.workspace_id)
      .eq("id", invoice.id);
    if (invoiceUpdateError) {
      console.error("[invoice-send] email sent but invoice delivery state update failed", invoiceUpdateError);
    }

    return json({
      data: {
        recipient,
        provider: sent.providerName,
        provider_message_id: sent.providerMessageId,
        invoice_status: nextStatus,
        amount_paid: paid,
        balance_due: balance,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
