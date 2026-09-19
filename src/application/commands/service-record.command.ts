/** Service Record Command — canonical API-only writes. */
import { nextApi } from "@/lib/nextApiClient";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { bankersRound } from "@/lib/financialMath";

export interface ServiceRecordData {
  customerId?: string | null;
  vehicleId?: string | null;
  serviceDate: string;
  serviceType: string;
  description: string;
  partsUsed?: string | null;
  laborHours?: number | null;
  laborCost?: number | null;
  partsCost?: number | null;
  totalCost: number;
  status: "pending" | "in_progress" | "completed";
  notes?: string | null;
  technician?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  discountType?: string | null;
  discountAmount?: number | null;
  shopSupplies?: number | null;
  paymentStatus?: "unpaid" | "partial" | "paid" | null;
  paidAmount?: number | null;
  appointmentId?: string | null;
}

export interface FilterPart { name: string; partNumber: string; }
export interface CreateServiceRecordResult { success: boolean; serviceId?: string; serviceNumber?: string; error?: string; }
export interface AppointmentToServiceData {
  appointmentId: string;
  technician?: string;
  additionalNotes?: string;
  laborHours?: number;
  shopSupplies?: number;
  mileage?: number;
  vin?: string;
  filterParts?: FilterPart[];
  oilQuartsUsed?: number;
  oilType?: string;
}

function workspaceId(): string {
  const id = getSelectedWorkspaceId();
  if (!id) throw new Error("Select a workspace before managing a service record.");
  return id;
}
function formatFilterPartsForDisplay(parts: FilterPart[]): string {
  return parts.map((part) => `${part.name}: ${part.partNumber}`).join(", ");
}
function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function createServiceRecord(data: ServiceRecordData, _ownerUserId?: string): Promise<CreateServiceRecordResult> {
  try {
    const workspace_id = workspaceId();
    const labor = bankersRound(Number(data.laborCost ?? 0), 2);
    const parts = bankersRound(Number(data.partsCost ?? 0), 2);
    const supplies = bankersRound(Number(data.shopSupplies ?? 0), 2);
    const subtotal = bankersRound(labor + parts + supplies, 2);
    const discount = bankersRound(Number(data.discountAmount ?? 0), 2);
    if (discount > subtotal) throw new Error("Discount cannot exceed subtotal.");
    const taxRate = bankersRound(Number(data.taxRate ?? 0), 4);
    const taxAmount = data.taxAmount == null
      ? bankersRound(Math.max(subtotal - discount, 0) * (taxRate / 100), 2)
      : bankersRound(Number(data.taxAmount), 2);
    const expectedTotal = bankersRound(Math.max(subtotal - discount, 0) + taxAmount, 2);
    const requestedTotal = bankersRound(Number(data.totalCost ?? expectedTotal), 2);
    if (Math.abs(requestedTotal - expectedTotal) > 0.01) throw new Error("Service record total does not match subtotal, discount, and tax.");

    const response = await nextApi.serviceRecords.create({
      workspace_id,
      appointment_id: data.appointmentId ?? null,
      customer_id: data.customerId ?? null,
      vehicle_id: data.vehicleId ?? null,
      status: data.status === "pending" ? "draft" : data.status,
      work_performed: data.description,
      internal_notes: data.notes ?? null,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      discount_amount: discount,
      total_amount: expectedTotal,
      metadata: {
        service_date: data.serviceDate,
        service_type: data.serviceType,
        parts_used: data.partsUsed ?? null,
        labor_hours: data.laborHours ?? null,
        labor_cost: labor,
        parts_cost: parts,
        shop_supplies: supplies,
        technician: data.technician ?? null,
        discount_type: data.discountType ?? null,
      },
    });
    const record = response.data as { id?: string; metadata?: Record<string, unknown> } | null;
    if (!record?.id) throw new Error("Service record creation returned no id.");
    return { success: true, serviceId: record.id, serviceNumber: typeof record.metadata?.service_number === "string" ? record.metadata.service_number : undefined };
  } catch (error) {
    return { success: false, error: message(error, "Failed to create service record") };
  }
}

/** Compatibility entrypoint: appointment completion is authoritative and idempotent. */
export async function createServiceRecordFromAppointment(data: AppointmentToServiceData): Promise<CreateServiceRecordResult> {
  const result = await completeAppointmentWithServiceRecord(data.appointmentId);
  return result.success ? { success: true, serviceId: result.serviceId } : { success: false, error: result.error };
}

export interface AppointmentCloseoutResult {
  success: boolean;
  serviceId?: string;
  serviceIds?: string[];
  invoiceId?: string;
  paymentId?: string;
  subtotal?: number;
  taxAmount?: number;
  cardFeeAmount?: number;
  total?: number;
  amountPaid?: number;
  balanceDue?: number;
  currencyCode?: string;
  error?: string;
}

/** Complete an appointment through the canonical multi-vehicle financial closeout. */
export async function completeAppointmentWithServiceRecord(
  appointmentId: string,
): Promise<AppointmentCloseoutResult> {
  try {
    const workspace_id = workspaceId();
    const completion = await nextApi.appointments.complete(appointmentId, workspace_id);
    const closeout = completion.data as Record<string, unknown> | null;
    if (!closeout) throw new Error("Appointment completion returned no closeout data.");

    const serviceIds = Array.isArray(closeout.service_record_ids)
      ? closeout.service_record_ids.map(String).filter(Boolean)
      : [];
    const serviceId = String(closeout.service_record_id ?? serviceIds[0] ?? "");
    if (!serviceId && serviceIds.length === 0) throw new Error("Appointment completion returned no service records.");

    return {
      success: true,
      serviceId: serviceId || serviceIds[0],
      serviceIds,
      invoiceId: closeout.invoice_id ? String(closeout.invoice_id) : undefined,
      paymentId: closeout.payment_id ? String(closeout.payment_id) : undefined,
      subtotal: Number(closeout.subtotal ?? 0),
      taxAmount: Number(closeout.tax_amount ?? 0),
      cardFeeAmount: Number(closeout.card_fee_amount ?? 0),
      total: Number(closeout.total ?? 0),
      amountPaid: Number(closeout.amount_paid ?? 0),
      balanceDue: Number(closeout.balance_due ?? 0),
      currencyCode: String(closeout.currency_code ?? "USD"),
    };
  } catch (error) {
    const raw = message(error, "Failed to complete appointment");
    const friendly: Record<string, string> = {
      "INSPECTION_REQUIRED": "Complete every required vehicle inspection before closing the appointment.",
      "RECOMMENDATION_REQUIRED": "Resolve every pending or approved recommendation before closing the appointment.",
      "Appointment cannot complete while recommendations": "Resolve every pending or approved recommendation before closing the appointment.",
    };
    return { success: false, error: Object.entries(friendly).find(([key]) => raw.includes(key))?.[1] ?? raw };
  }
}

export async function updateServiceRecordStatus(serviceId: string, status: "pending" | "in_progress" | "completed"): Promise<{ success: boolean; error?: string }> {
  try {
    await nextApi.serviceRecords.update(serviceId, { workspace_id: workspaceId(), status: status === "pending" ? "draft" : status });
    return { success: true };
  } catch (error) { return { success: false, error: message(error, "Failed to update service record status") }; }
}

/** Payment state is canonical on invoices/payments, never service-record metadata. */
export async function updateServicePaymentStatus(_serviceId: string, _paymentStatus: "unpaid" | "partial" | "paid", _paidAmount?: number): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: "Payment status is managed by canonical invoices and payments." };
}
