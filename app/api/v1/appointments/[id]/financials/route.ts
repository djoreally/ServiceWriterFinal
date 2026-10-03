import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const appointmentId = z.string().uuid().parse((await context.params).id);
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(
      url.searchParams.get("selected_workspace_id")
        ?? url.searchParams.get("workspace_id"),
    );
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", appointmentId)
      .maybeSingle();
    if (appointmentError) throw appointmentError;
    if (!appointment) {
      return json({ error: { code: "not_found", message: "Appointment not found." } }, { status: 404 });
    }

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .select("id,invoice_number,status,subtotal,tax_total,total,amount_paid,metadata,invoice_lines(id,description,quantity,unit_price,tax_rate,sort_order,metadata)")
      .eq("workspace_id", workspaceId)
      .contains("metadata", { appointment_id: appointmentId })
      .order("created_at", { ascending: false })
      .limit(1);
    if (invoiceError) throw invoiceError;

    const invoice = invoices?.[0] ?? null;
    if (!invoice) return json({ data: null });

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("id,status,amount,provider,provider_payment_id,paid_at,created_at")
      .eq("workspace_id", workspaceId)
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true });
    if (paymentsError) throw paymentsError;

    const lines = Array.isArray((invoice as any).invoice_lines)
      ? (invoice as any).invoice_lines
      : [];
    const lineSubtotal = lines.reduce(
      (sum: number, line: any) =>
        sum + Number(line.quantity ?? 0) * Number(line.unit_price ?? 0),
      0,
    );
    const subtotal = Number(invoice.subtotal ?? 0);
    const tax = Number(invoice.tax_total ?? 0);
    const total = Number(invoice.total ?? 0);
    const paid = Number(invoice.amount_paid ?? 0);
    const metadata = invoice.metadata && typeof invoice.metadata === "object" && !Array.isArray(invoice.metadata)
      ? invoice.metadata as Record<string, unknown>
      : {};
    const discount = Number(metadata.computed_discount_amount ?? metadata.discount_amount ?? 0) || 0;

    return json({
      data: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
        status: invoice.status,
        subtotal,
        tax,
        total,
        amount_paid: paid,
        balance_due: Math.max(0, total - paid),
        discount,
        lines,
        payments: payments ?? [],
        integrity: {
          line_subtotal: lineSubtotal,
          subtotal_matches_lines: Math.abs(lineSubtotal - subtotal) < 0.005,
          total_matches_header: Math.abs((subtotal - discount + tax) - total) < 0.005,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
