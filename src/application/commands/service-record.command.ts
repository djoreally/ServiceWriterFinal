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
  const result = await completeAppointmentWithServiceRecord(data.appointmentId, data);
  return result.success ? { success: true, serviceId: result.serviceId } : { success: false, error: result.error };
}

/** Complete an appointment through the canonical financial closeout and enrich its generated service record. */
export async function completeAppointmentWithServiceRecord(
  appointmentId: string,
  options?: {
    technician?: string;
    additionalNotes?: string;
    laborHours?: number;
    mileage?: number;
    vin?: string;
    filterParts?: FilterPart[];
    oilQuartsUsed?: number;
    oilType?: string;
  },
): Promise<{ success: boolean; serviceId?: string; error?: string }> {
  try {
    const workspace_id = workspaceId();
    const completion = await nextApi.appointments.complete(appointmentId, workspace_id);
    const closeout = completion.data as { service_record_id?: string } | null;
    const serviceId = closeout?.service_record_id;
    if (!serviceId) throw new Error("Appointment completion returned no service record id.");

    const metadata: Record<string, unknown> = {};
    if (options?.technician) metadata.technician = options.technician;
    if (options?.laborHours != null) metadata.labor_hours = options.laborHours;
    if (options?.mileage != null) metadata.mileage = options.mileage;
    if (options?.vin) metadata.vin = options.vin;
    if (options?.oilType?.trim()) metadata.oil_type = options.oilType.trim();
    if (options?.filterParts?.length) metadata.filter_parts = formatFilterPartsForDisplay(options.filterParts);

    if (options?.additionalNotes || options?.oilQuartsUsed != null || Object.keys(metadata).length) {
      await nextApi.serviceRecords.update(serviceId, {
        workspace_id,
        ...(options?.additionalNotes ? { internal_notes: options.additionalNotes } : {}),
        ...(options?.oilQuartsUsed != null ? { oil_quarts_used: options.oilQuartsUsed } : {}),
        ...(Object.keys(metadata).length ? { metadata } : {}),
      });
    }
    return { success: true, serviceId };
  } catch (error) {
    const raw = message(error, "Failed to complete appointment");
    const friendly: Record<string, string> = {
      "Vehicle oil type must be recorded": "Please set the vehicle's oil type before completing this oil service.",
      "Oil services require confirmed oil quantity": "Oil quantity is required. Please enter the number of quarts used.",
      "Oil services require filter replacement": "Filter/parts confirmation is required for oil services.",
      "Captured VIN does not match": "The VIN entered does not match the vehicle on file. Please verify.",
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
