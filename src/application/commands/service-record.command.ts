/**
 * Service Record Command - Application Layer
 * 
 * Handles all service record operations:
 * - Create manual service records
 * - Generate service records from completed appointments
 * - Update service record status
 * - Itemize oil usage based on vehicle specs
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
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
  status: 'pending' | 'in_progress' | 'completed';
  notes?: string | null;
  technician?: string | null;
  taxRate?: number | null;
  taxAmount?: number | null;
  discountType?: string | null;
  discountAmount?: number | null;
  shopSupplies?: number | null;
  paymentStatus?: 'unpaid' | 'partial' | 'paid' | null;
  paidAmount?: number | null;
  appointmentId?: string | null;
}

export interface FilterPart {
  name: string;
  partNumber: string;
}

export interface CreateServiceRecordResult {
  success: boolean;
  serviceId?: string;
  serviceNumber?: string;
  error?: string;
}

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

/**
 * Create a manual service record.
 *
 * @param data       Service record payload
 * @param ownerUserId Optional business-owner user_id. When the caller is a
 *                    technician (auth.uid() differs from business owner), pass
 *                    the resolved businessUserId from useTechIdentity so the
 *                    record is correctly tenant-scoped.
 */
export async function createServiceRecord(
  data: ServiceRecordData,
  ownerUserId?: string,
): Promise<CreateServiceRecordResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const tenantUserId = ownerUserId || user.id;

  try {
    const { data: serviceRecord, error } = await supabase
      .from('services')
      .insert({
        user_id: tenantUserId,
        customer_id: data.customerId || null,
        vehicle_id: data.vehicleId || null,
        service_date: data.serviceDate,
        service_type: data.serviceType,
        description: data.description,
        parts_used: data.partsUsed || null,
        labor_hours: data.laborHours || null,
        labor_cost: data.laborCost || null,
        parts_cost: data.partsCost || null,
        total_cost: data.totalCost,
        status: data.status,
        notes: data.notes || null,
        technician: data.technician || null,
        tax_rate: data.taxRate || null,
        tax_amount: data.taxAmount || null,
        discount_type: data.discountType || null,
        discount_amount: data.discountAmount || null,
        shop_supplies: data.shopSupplies || null,
        payment_status: data.paymentStatus || 'unpaid',
        paid_amount: data.paidAmount || null,
        appointment_id: data.appointmentId || null,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      success: true,
      serviceId: serviceRecord.id,
      serviceNumber: serviceRecord.service_number,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to create service record:', err);
    return {
      success: false,
      error: err.message || 'Failed to create service record',
    };
  }
}

/**
 * Format filter parts for display on invoices/service records
 */
function formatFilterPartsForDisplay(filterParts: FilterPart[]): string {
  if (!filterParts || filterParts.length === 0) return '';
  return filterParts.map(f => `${f.name}: ${f.partNumber}`).join(', ');
}

/**
 * Look up vehicle specs from the vehicle_specifications table
 * and build a notes section based on which services are booked.
 */
async function buildVehicleSpecNotes(
  vehicle: { year: number; make: string; model: string } | null,
  bookedServiceNames: string[]
): Promise<string> {
  if (!vehicle) return '';

  const { data: specs } = await supabase
    .from('vehicle_specifications')
    .select('oil_capacity, oil_filter, air_filter, cabin_filter, fuel_filter, additional_specs')
    .eq('year', vehicle.year)
    .ilike('make', vehicle.make)
    .ilike('model', vehicle.model)
    .limit(1);

  if (!specs || specs.length === 0) return '';
  const spec = specs[0];
  const additionalSpecs = spec.additional_specs as Record<string, string | null> | null;

  const lines: string[] = [];
  const serviceNamesLower = bookedServiceNames.map(n => n.toLowerCase());

  // Helper to check if any booked service matches keywords
  const hasService = (...keywords: string[]) =>
    serviceNamesLower.some(name => keywords.some(kw => name.includes(kw)));

  // Oil change / general service → oil capacity, oil filter, drain plug torque
  const isOilRelated = hasService('oil', 'lube', 'maintenance', 'full service', 'pm ');
  if (isOilRelated || serviceNamesLower.length === 0) {
    if (spec.oil_capacity) lines.push(`Oil Capacity: ${spec.oil_capacity} qt`);
    if (spec.oil_filter) lines.push(`Oil Filter: ${spec.oil_filter}`);
    const drainPlugTorque = additionalSpecs?.oil_plug_torque || additionalSpecs?.drain_plug_torque;
    if (drainPlugTorque) lines.push(`Drain Plug Torque: ${drainPlugTorque}`);
  }

  // Air filter service
  if (hasService('air filter', 'engine filter', 'air intake')) {
    if (spec.air_filter) lines.push(`Air Filter: ${spec.air_filter}`);
  }

  // Cabin air filter service
  if (hasService('cabin', 'cabin air', 'cabin filter', 'hvac')) {
    if (spec.cabin_filter) lines.push(`Cabin Air Filter: ${spec.cabin_filter}`);
  }

  // Fuel filter service
  if (hasService('fuel filter', 'fuel system')) {
    if (spec.fuel_filter) lines.push(`Fuel Filter: ${spec.fuel_filter}`);
  }

  if (lines.length === 0) return '';
  return `--- Vehicle Specs ---\n${lines.join('\n')}`;
}

/**
 * Generate a service record from a completed appointment
 * Calculates costs from existing pricing setup and itemizes oil usage
 */
export async function createServiceRecordFromAppointment(
  data: AppointmentToServiceData
): Promise<CreateServiceRecordResult> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    // 1. Fetch the appointment with all related data
    const { data: appointment, error: appointmentError } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers(*),
        vehicle:vehicles(*),
        service_catalog:service_catalog(id, name, labor_rate)
      `)
      .eq('id', data.appointmentId)
      .eq('user_id', user.id)
      .single();

    if (appointmentError || !appointment) {
      throw new Error('Appointment not found');
    }

    // 2. Fetch appointment_services to get itemized services
    const { data: appointmentServices } = await supabase
      .from('appointment_services')
      .select('*')
      .eq('appointment_id', data.appointmentId);

    // 3. Build service description and compute total_cost from line items
    let serviceDescription = '';
    let lineItemTotal = 0;
    
    if (appointmentServices && appointmentServices.length > 0) {
      serviceDescription = appointmentServices.map(s => `${s.name} (${s.quantity}x)`).join(', ');
      // Sum line item costs: price (dollars) * quantity
      lineItemTotal = appointmentServices.reduce(
        (sum, s) => sum + (Number(s.price) || 0) * (s.quantity || 1),
        0
      );
    }
    
    const laborHours = data.laborHours || 0;
    
    // Build parts used string from filter parts AND oil info
    const partsEntries: string[] = [];
    if (data.filterParts) {
      partsEntries.push(formatFilterPartsForDisplay(data.filterParts));
    }
    // Include oil usage in parts used
    if (data.oilQuartsUsed && data.oilQuartsUsed > 0) {
      const oilType = (data.oilType && data.oilType.trim())
        || appointment.vehicle?.oil_type
        || 'Motor Oil';
      partsEntries.push(`Oil: ${data.oilQuartsUsed} qt ${oilType}`);
    }
    const partsUsed = partsEntries.length > 0 ? partsEntries.join(', ') : null;
    
    // Build description
    const finalDescription = serviceDescription || appointment.description || 'Completed service';

    // 3b. Build vehicle spec notes based on booked services
    const bookedServiceNames: string[] = [];
    if (appointmentServices && appointmentServices.length > 0) {
      bookedServiceNames.push(...appointmentServices.map(s => s.name));
    }
    if (appointment.service_catalog?.name) {
      bookedServiceNames.push(appointment.service_catalog.name);
    }
    if (appointment.title) {
      bookedServiceNames.push(appointment.title);
    }

    const vehicleSpecNotes = await buildVehicleSpecNotes(
      appointment.vehicle ? {
        year: appointment.vehicle.year,
        make: appointment.vehicle.make,
        model: appointment.vehicle.model,
      } : null,
      bookedServiceNames
    );

    // Combine notes
    const combinedNotes = [appointment.notes, data.additionalNotes, vehicleSpecNotes]
        .filter(Boolean)
        .join('\n---\n');

    // 4. Update vehicle with mileage and VIN if provided
    if (appointment.vehicle_id) {
      const vehicleUpdates: { mileage?: number; vin?: string } = {};
      if (data.mileage) vehicleUpdates.mileage = data.mileage;
      if (data.vin) vehicleUpdates.vin = data.vin;
      
      if (Object.keys(vehicleUpdates).length > 0) {
        await supabase
          .from('vehicles')
          .update(vehicleUpdates)
          .eq('id', appointment.vehicle_id);
      }
    }

    // 5. Create the service record with computed total_cost from line items
    // total_cost = subtotal + tax (customer-facing grand total in DOLLARS)
    const subtotal = lineItemTotal > 0 ? lineItemTotal : Number(appointment.estimated_cost) || 0;
    const taxAmount = Number(appointment.tax_amount) || 0;
    const computedTotalCost = subtotal + taxAmount;

    const { data: serviceRecord, error: serviceError } = await supabase
      .from('services')
      .insert({
        user_id: user.id,
        appointment_id: data.appointmentId,
        customer_id: appointment.customer_id,
        vehicle_id: appointment.vehicle_id,
        service_date: appointment.scheduled_date,
        service_type: appointment.service_catalog?.name || appointment.title || 'General Service',
        description: finalDescription,
        parts_used: partsUsed,
        labor_hours: laborHours > 0 ? laborHours : null,
        labor_cost: 0,
        parts_cost: 0,
        total_cost: computedTotalCost,
        tax_amount: taxAmount > 0 ? taxAmount : null,
        tax_rate: appointment.applied_tax_rate ?? null,
        status: 'completed',
        notes: combinedNotes || null,
        technician: data.technician || null,
        shop_supplies: 0,
        payment_status: null,
        oil_quarts_used: data.oilQuartsUsed || null,
      })
      .select()
      .single();

    if (serviceError) throw serviceError;

    return {
      success: true,
      serviceId: serviceRecord.id,
      serviceNumber: serviceRecord.service_number,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to create service record from appointment:', err);
    return {
      success: false,
      error: err.message || 'Failed to create service record',
    };
  }
}

/**
 * Complete an appointment and generate a service record
 */
/**
 * Complete an appointment and generate a service record — atomically via DB RPC.
 * All writes (vehicle update, service insert, appointment update) happen in a
 * single PL/pgSQL transaction so partial writes roll back on failure.
 */
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
  }
): Promise<{ success: boolean; serviceId?: string; error?: string }> {
  try {
    const filterPartsStr = options?.filterParts
      ? formatFilterPartsForDisplay(options.filterParts)
      : null;
    const oilTypeTrimmed = options?.oilType?.trim() || null;
    const completionIdempotencyKey = [
      "appt-complete-v1",
      appointmentId,
      options?.technician ?? "",
      options?.additionalNotes ?? "",
      String(options?.laborHours ?? ""),
      String(options?.mileage ?? ""),
      options?.vin ?? "",
      String(options?.oilQuartsUsed ?? ""),
      filterPartsStr ?? "",
      oilTypeTrimmed ?? "",
    ].join("|");

    const { data, error } = await supabase.rpc(
      'complete_appointment_with_service_record' as any,
      {
        p_appointment_id: appointmentId,
        p_technician: options?.technician ?? null,
        p_additional_notes: options?.additionalNotes ?? null,
        p_labor_hours: options?.laborHours ?? null,
        p_mileage: options?.mileage ?? null,
        p_vin: options?.vin ?? null,
        p_oil_quarts_used: options?.oilQuartsUsed ?? null,
        p_filter_parts: filterPartsStr,
        p_shop_supplies: 0,
        p_idempotency_key: completionIdempotencyKey,
        p_oil_type: oilTypeTrimmed,
      } as any,
    );


    if (error) throw new Error(error.message);

    const result = data as any;

    // Oil usage is a reporting metric sourced from the verified quantity stored
    // on the completed service record. Completion must not mutate inventory.

    return {
      success: true,
      serviceId: result?.service_id,
    };
  } catch (error: unknown) {
    const err = error as Error;
    console.error('Failed to complete appointment:', err);

    // Translate DB enforcement errors into user-friendly messages
    const msg = err.message || 'Failed to complete appointment';
    const friendlyMap: Record<string, string> = {
      'Vehicle oil type must be recorded': 'Please set the vehicle\'s oil type before completing this oil service. Go to the vehicle profile and update the oil type field.',
      'Oil services require confirmed oil quantity': 'Oil quantity is required. Please enter the number of quarts used.',
      'Oil services require filter replacement': 'Filter/parts confirmation is required for oil services.',
      'Captured VIN does not match': 'The VIN entered does not match the vehicle on file. Please verify.',
      'does not match manufacturer spec': 'The vehicle\'s oil type or capacity conflicts with the manufacturer spec for this VIN. Update the vehicle (or your selection) so they match before completing.',
    };
    const friendlyMsg = Object.entries(friendlyMap).find(([key]) => msg.includes(key))?.[1] ?? msg;


    return {
      success: false,
      error: friendlyMsg,
    };
  }
}

/**
 * Update service record status
 */
export async function updateServiceRecordStatus(
  serviceId: string,
  status: 'pending' | 'in_progress' | 'completed'
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const { error } = await supabase
      .from('services')
      .update({ status })
      .eq('id', serviceId)
      .eq('user_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}

/**
 * Update service record payment status
 */
export async function updateServicePaymentStatus(
  serviceId: string,
  paymentStatus: 'unpaid' | 'partial' | 'paid',
  paidAmount?: number
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const { error } = await supabase
      .from('services')
      .update({ 
        payment_status: paymentStatus,
        paid_amount: paidAmount || null,
      })
      .eq('id', serviceId)
      .eq('user_id', user.id);

    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    const err = error as Error;
    return { success: false, error: err.message };
  }
}
