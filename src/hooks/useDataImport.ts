import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ParsedRow, parseDate, parseTime, parseNumber } from '@/lib/importParser';
import { format } from 'date-fns';
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

function splitName(name: string): { first_name: string; last_name: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { first_name: parts.shift() || "Customer", last_name: parts.length ? parts.join(" ") : null };
}

function appointmentTimes(date: string, time: string | null, durationMinutes: number) {
  const safeTime = time || "09:00";
  const starts = new Date(`${date}T${safeTime}:00`);
  if (!Number.isFinite(starts.getTime())) throw new Error("Invalid appointment date/time");
  const ends = new Date(starts.getTime() + durationMinutes * 60_000);
  return { starts_at: starts.toISOString(), ends_at: ends.toISOString() };
}

export function useCustomerImport() {
  const importCustomers = useCallback(async (rows: ParsedRow[], mapping: Record<string, string>): Promise<{ success: number; failed: number; errors: string[] }> => {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) throw new Error('Not authenticated');
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error('No active workspace is available');

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = String(row[mapping.name] || '').trim();
        if (!name) { errors.push(`Row ${i + 2}: Name is required`); failed++; continue; }
        const { first_name, last_name } = splitName(name);
        const address = mapping.address ? String(row[mapping.address] || '').trim() || null : null;
        const customerData = {
          workspace_id: context.workspaceId,
          first_name,
          last_name,
          email: mapping.email ? String(row[mapping.email] || '').trim() || null : null,
          phone: mapping.phone ? String(row[mapping.phone] || '').trim() || null : null,
          address_line1: address,
          notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
          created_by: user.id,
        };
        const { data: customer, error: customerError } = await supabase.from('customers').insert(customerData).select().single();
        if (customerError) { errors.push(`Row ${i + 2}: ${customerError.message}`); failed++; continue; }

        const vehicleMake = mapping.make ? String(row[mapping.make] || '').trim() : '';
        const vehicleModel = mapping.model ? String(row[mapping.model] || '').trim() : '';
        if (vehicleMake && vehicleModel && customer) {
          const vehicleData = {
            workspace_id: context.workspaceId,
            customer_id: customer.id,
            make: vehicleMake,
            model: vehicleModel,
            year: mapping.year ? parseNumber(row[mapping.year]) || new Date().getFullYear() : new Date().getFullYear(),
            vin: mapping.vin ? String(row[mapping.vin] || '').trim() || null : null,
            license_plate: mapping.license_plate ? String(row[mapping.license_plate] || '').trim() || null : null,
            color: mapping.color ? String(row[mapping.color] || '').trim() || null : null,
            mileage: mapping.mileage ? parseNumber(row[mapping.mileage]) : null,
          };
          const { error: vehicleError } = await supabase.from('vehicles').insert(vehicleData);
          if (vehicleError) errors.push(`Row ${i + 2}: Customer created but vehicle failed - ${vehicleError.message}`);
        }
        success++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed++;
      }
    }
    return { success, failed, errors };
  }, []);
  return { importCustomers };
}

export function useAppointmentImport() {
  const importAppointments = useCallback(async (rows: ParsedRow[], mapping: Record<string, string>): Promise<{ success: number; failed: number; errors: string[] }> => {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) throw new Error('Not authenticated');
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error('No active workspace is available');

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, first_name, last_name, company_name, email, phone')
      .eq('workspace_id', context.workspaceId);

    type ImportedCustomer = { id: string; first_name: string | null; last_name: string | null; company_name: string | null; email: string | null; phone: string | null };
    const customerMap = new Map<string, ImportedCustomer>();
    for (const customer of (existingCustomers ?? []) as ImportedCustomer[]) {
      const name = customer.company_name || [customer.first_name, customer.last_name].filter(Boolean).join(' ');
      if (name) customerMap.set(name.toLowerCase(), customer);
    }

    const today = format(new Date(), 'yyyy-MM-dd');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const title = String(row[mapping.title] || '').trim();
        if (!title) { errors.push(`Row ${i + 2}: Title/Service type is required`); failed++; continue; }
        const scheduledDateMaybePromise = parseDate(row[mapping.scheduled_date]);
        const scheduledDate: string | null = scheduledDateMaybePromise instanceof Promise ? await scheduledDateMaybePromise : scheduledDateMaybePromise;
        if (!scheduledDate) { errors.push(`Row ${i + 2}: Valid date is required`); failed++; continue; }
        const isPast = scheduledDate < today;

        let customerId: string | null = null;
        let vehicleId: string | null = null;
        const customerName = mapping.customer_name ? String(row[mapping.customer_name] || '').trim() : '';
        if (customerName) {
          const existingCustomer = customerMap.get(customerName.toLowerCase());
          if (existingCustomer) customerId = existingCustomer.id;
          else {
            const { first_name, last_name } = splitName(customerName);
            const { data: newCustomer, error: customerError } = await supabase.from('customers').insert({
              workspace_id: context.workspaceId,
              first_name,
              last_name,
              email: mapping.customer_email ? String(row[mapping.customer_email] || '').trim() || null : null,
              phone: mapping.customer_phone ? String(row[mapping.customer_phone] || '').trim() || null : null,
              created_by: user.id,
            }).select().single();
            if (!customerError && newCustomer) {
              customerId = newCustomer.id;
              customerMap.set(customerName.toLowerCase(), newCustomer as ImportedCustomer);
            }
          }
        }

        const vehicleMake = mapping.vehicle_make ? String(row[mapping.vehicle_make] || '').trim() : '';
        const vehicleModel = mapping.vehicle_model ? String(row[mapping.vehicle_model] || '').trim() : '';
        if (vehicleMake && vehicleModel) {
          const { data: vehicle, error: vehicleError } = await supabase.from('vehicles').insert({
            workspace_id: context.workspaceId,
            customer_id: customerId,
            make: vehicleMake,
            model: vehicleModel,
            year: mapping.vehicle_year ? parseNumber(row[mapping.vehicle_year]) || new Date().getFullYear() : new Date().getFullYear(),
            vin: mapping.vehicle_vin ? String(row[mapping.vehicle_vin] || '').trim() || null : null,
            license_plate: mapping.vehicle_license ? String(row[mapping.vehicle_license] || '').trim() || null : null,
          }).select().single();
          if (!vehicleError && vehicle) vehicleId = vehicle.id;
        }

        const durationMinutes = mapping.duration_minutes ? parseNumber(row[mapping.duration_minutes]) || 60 : 60;
        const scheduledTime = parseTime(row[mapping.scheduled_time]);
        const times = appointmentTimes(scheduledDate, scheduledTime, durationMinutes);
        const description = mapping.description ? String(row[mapping.description] || '').trim() || null : null;
        const notes = mapping.notes ? String(row[mapping.notes] || '').trim() || null : null;
        const appointmentData = {
          workspace_id: context.workspaceId,
          customer_id: customerId,
          vehicle_id: vehicleId,
          status: isPast ? 'completed' : 'confirmed',
          ...times,
          notes,
          created_by: user.id,
          metadata: { imported: true, title, description, duration_minutes: durationMinutes },
        };
        const { data: appointment, error: appointmentError } = await supabase.from('appointments').insert(appointmentData).select().single();
        if (appointmentError) { errors.push(`Row ${i + 2}: ${appointmentError.message}`); failed++; continue; }

        if (isPast && appointment) {
          const completedAt = times.ends_at;
          const technicianLabel = mapping.technician ? String(row[mapping.technician] || '').trim() || null : null;
          const { error: serviceError } = await supabase.from('service_records').insert({
            workspace_id: context.workspaceId,
            appointment_id: appointment.id,
            customer_id: customerId,
            vehicle_id: vehicleId,
            completed_by: user.id,
            status: 'completed',
            work_performed: description || `Imported service: ${title}`,
            customer_notes: notes,
            started_at: times.starts_at,
            completed_at: completedAt,
            subtotal: 0,
            tax_amount: 0,
            discount_amount: 0,
            total_amount: 0,
            currency_code: 'USD',
            metadata: { imported: true, service_name: title, technician_label: technicianLabel },
          });
          if (serviceError) errors.push(`Row ${i + 2}: Appointment created but service record failed - ${serviceError.message}`);
        }
        success++;
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        failed++;
      }
    }
    return { success, failed, errors };
  }, []);
  return { importAppointments };
}
