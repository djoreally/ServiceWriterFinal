import "server-only";

import { serviceWriterApi } from "@/server/service-writer-api";

export type ApiInvoice = Record<string, unknown> & {
  id: string;
  workspaceId: string;
  workOrderId: string;
  invoiceNumber?: string | null;
  status: "draft" | "issued" | "superseded" | "void";
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  amountDueCents: number;
  dueAt?: string | null;
  issuedAt?: string | null;
  metadata?: Record<string, unknown> | null;
  lines?: Array<Record<string, unknown>>;
};

type ApiWorkOrder = Record<string, unknown> & { customerId?: string; vehicleId?: string };
type ApiCustomer = Record<string, unknown> & { id?: string; firstName?: string; lastName?: string; companyName?: string | null; email?: string | null; phone?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; metadata?: unknown };
type ApiVehicle = Record<string, unknown> & { id?: string; year?: number | null; make?: string | null; model?: string | null; vin?: string | null; licensePlate?: string | null };

export function dollars(cents: unknown) {
  return typeof cents === "number" ? cents / 100 : 0;
}

export function cents(amount: number) {
  return Math.round(amount * 100);
}

export function quantityMilli(quantity: number) {
  return Math.max(1, Math.round(quantity * 1000));
}

export async function legacyInvoice(request: Request, workspaceId: string, invoice: ApiInvoice) {
  const workOrder = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${workspaceId}/work-orders/${invoice.workOrderId}`);
  const [customer, vehicle] = await Promise.all([
    workOrder.customerId ? serviceWriterApi<ApiCustomer>(request, `/api/v1/workspaces/${workspaceId}/customers/${workOrder.customerId}`).catch(() => null) : Promise.resolve(null),
    workOrder.vehicleId ? serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${workspaceId}/vehicles/${workOrder.vehicleId}`).catch(() => null) : Promise.resolve(null),
  ]);
  const metadata = invoice.metadata && typeof invoice.metadata === "object" ? invoice.metadata : {};
  const paymentState = invoice.status === "void" ? "void" : invoice.status === "draft" ? "draft" : invoice.amountDueCents <= 0 ? "paid" : invoice.amountDueCents < invoice.totalCents ? "partially_paid" : "issued";
  const lines = (invoice.lines ?? []).map((line) => ({
    ...line,
    description: line.descriptionSnapshot,
    quantity: typeof line.quantityMilli === "number" ? line.quantityMilli / 1000 : 1,
    unit_price: dollars(line.unitPriceCentsSnapshot),
    subtotal: dollars(line.lineSubtotalCents),
    tax_rate: line.taxableSnapshot ? Number(invoice.taxRateBasisPoints ?? 0) / 100 : 0,
    display_order: line.sortOrder,
    metadata: line.metadata,
  }));
  return {
    ...invoice,
    workspace_id: invoice.workspaceId,
    work_order_id: invoice.workOrderId,
    customer_id: workOrder.customerId ?? null,
    vehicle_id: workOrder.vehicleId ?? null,
    invoice_number: invoice.invoiceNumber,
    status: paymentState,
    subtotal: dollars(invoice.subtotalCents),
    discount_amount: dollars(invoice.discountCents),
    tax_amount: dollars(invoice.taxCents),
    total: dollars(invoice.totalCents),
    amount_paid: dollars(Math.max(0, invoice.totalCents - invoice.amountDueCents)),
    amount_due: dollars(invoice.amountDueCents),
    due_date: invoice.dueAt ? String(invoice.dueAt).slice(0, 10) : null,
    issue_date: invoice.issuedAt ? String(invoice.issuedAt).slice(0, 10) : null,
    created_at: invoice.createdAt,
    updated_at: invoice.updatedAt,
    notes: invoice.customerMessage ?? metadata.notes ?? null,
    payment_terms: metadata.payment_terms ?? null,
    terms_text: metadata.terms_text ?? null,
    contact_name: metadata.contact_name ?? null,
    contact_email: metadata.contact_email ?? null,
    contact_phone: metadata.contact_phone ?? null,
    invoice_lines: lines,
    customers: customer ? {
      id: customer.id,
      first_name: customer.firstName,
      last_name: customer.lastName,
      company_name: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      address_line1: customer.addressLine1,
      address_line2: customer.addressLine2,
      city: customer.city,
      region: customer.region,
      postal_code: customer.postalCode,
      metadata: customer.metadata,
    } : null,
    vehicles: vehicle ? {
      id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      license_plate: vehicle.licensePlate,
    } : null,
  };
}
