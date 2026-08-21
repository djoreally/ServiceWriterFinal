import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ParsedRow, parseDate, parseTime, parseNumber } from '@/lib/importParser';
import { format } from 'date-fns';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export function useCustomerImport() {
  const importCustomers = useCallback(async (
    rows: ParsedRow[], 
    mapping: Record<string, string>
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) throw new Error('Not authenticated');

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const name = String(row[mapping.name] || '').trim();
        if (!name) {
          errors.push(`Row ${i + 2}: Name is required`);
          failed++;
          continue;
        }

        // Create or find customer
        const customerData = {
          user_id: user.id,
          name,
          email: mapping.email ? String(row[mapping.email] || '').trim() || null : null,
          phone: mapping.phone ? String(row[mapping.phone] || '').trim() || null : null,
          address: mapping.address ? String(row[mapping.address] || '').trim() || null : null,
          notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
        };

        const { data: customer, error: customerError } = await supabase
          .from('customers')
          .insert(customerData)
          .select()
          .single();

        if (customerError) {
          errors.push(`Row ${i + 2}: ${customerError.message}`);
          failed++;
          continue;
        }

        // If vehicle data is present, create vehicle too
        const vehicleMake = mapping.make ? String(row[mapping.make] || '').trim() : '';
        const vehicleModel = mapping.model ? String(row[mapping.model] || '').trim() : '';
        
        if (vehicleMake && vehicleModel && customer) {
          const vehicleData = {
            user_id: user.id,
            customer_id: customer.id,
            make: vehicleMake,
            model: vehicleModel,
            year: mapping.year ? parseNumber(row[mapping.year]) || new Date().getFullYear() : new Date().getFullYear(),
            vin: mapping.vin ? String(row[mapping.vin] || '').trim() || null : null,
            license_plate: mapping.license_plate ? String(row[mapping.license_plate] || '').trim() || null : null,
            color: mapping.color ? String(row[mapping.color] || '').trim() || null : null,
            mileage: mapping.mileage ? parseNumber(row[mapping.mileage]) : null,
          };

          const { error: vehicleError } = await supabase
            .from('vehicles')
            .insert(vehicleData);

          if (vehicleError) {
            errors.push(`Row ${i + 2}: Customer created but vehicle failed - ${vehicleError.message}`);
          }
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
  const importAppointments = useCallback(async (
    rows: ParsedRow[], 
    mapping: Record<string, string>
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    const { data: { user } } = await getCurrentAuthUser();
    if (!user) throw new Error('Not authenticated');

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Pre-fetch existing customers for matching
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, name, email, phone')
      .eq('user_id', user.id);

    const customerMap = new Map(
      existingCustomers?.map(c => [c.name.toLowerCase(), c]) || []
    );

    const today = format(new Date(), 'yyyy-MM-dd');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        const title = String(row[mapping.title] || '').trim();
        if (!title) {
          errors.push(`Row ${i + 2}: Title/Service type is required`);
          failed++;
          continue;
        }

        const scheduledDateMaybePromise = parseDate(row[mapping.scheduled_date]);
        // parseDate may return Promise<string> in some implementations — resolve it safely
        const scheduledDate: string | null = scheduledDateMaybePromise instanceof Promise
          ? await scheduledDateMaybePromise
          : scheduledDateMaybePromise;

        if (!scheduledDate) {
          errors.push(`Row ${i + 2}: Valid date is required`);
          failed++;
          continue;
        }

        // Determine if this is a past appointment
        const isPast = scheduledDate < today;

        // Try to find or create customer if name is provided
        let customerId: string | null = null;
        let vehicleId: string | null = null;
        
        const customerName = mapping.customer_name ? String(row[mapping.customer_name] || '').trim() : '';
        if (customerName) {
          const existingCustomer = customerMap.get(customerName.toLowerCase());
          if (existingCustomer) {
            customerId = existingCustomer.id;
          } else {
            // Create new customer
            const { data: newCustomer, error: customerError } = await supabase
              .from('customers')
              .insert({
                user_id: user.id,
                name: customerName,
                email: mapping.customer_email ? String(row[mapping.customer_email] || '').trim() || null : null,
                phone: mapping.customer_phone ? String(row[mapping.customer_phone] || '').trim() || null : null,
              })
              .select()
              .single();

            if (!customerError && newCustomer) {
              customerId = newCustomer.id;
              customerMap.set(customerName.toLowerCase(), newCustomer);
            }
          }
        }

        // Try to create vehicle if data is provided
        const vehicleMake = mapping.vehicle_make ? String(row[mapping.vehicle_make] || '').trim() : '';
        const vehicleModel = mapping.vehicle_model ? String(row[mapping.vehicle_model] || '').trim() : '';
        
        if (vehicleMake && vehicleModel) {
          const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .insert({
              user_id: user.id,
              customer_id: customerId,
              make: vehicleMake,
              model: vehicleModel,
              year: mapping.vehicle_year ? parseNumber(row[mapping.vehicle_year]) || new Date().getFullYear() : new Date().getFullYear(),
              vin: mapping.vehicle_vin ? String(row[mapping.vehicle_vin] || '').trim() || null : null,
              license_plate: mapping.vehicle_license ? String(row[mapping.vehicle_license] || '').trim() || null : null,
            })
            .select()
            .single();

          if (!vehicleError && vehicle) {
            vehicleId = vehicle.id;
          }
        }

        // Create appointment
        const appointmentData = {
          user_id: user.id,
          title,
          description: mapping.description ? String(row[mapping.description] || '').trim() || null : null,
          scheduled_date: scheduledDate,
          scheduled_time: parseTime(row[mapping.scheduled_time]),
          duration_minutes: mapping.duration_minutes ? parseNumber(row[mapping.duration_minutes]) || 60 : 60,
          customer_id: customerId,
          vehicle_id: vehicleId,
          // Imported appointments never carry financial data — invoices are imported separately
          estimated_cost: null as number | null,
          notes: mapping.notes ? String(row[mapping.notes] || '').trim() || null : null,
          status: isPast ? 'completed' : 'confirmed',
        };

        const { data: appointment, error: appointmentError } = await supabase
          .from('appointments')
          .insert(appointmentData)
          .select()
          .single();

        if (appointmentError) {
          errors.push(`Row ${i + 2}: ${appointmentError.message}`);
          failed++;
          continue;
        }

        // For past appointments, create a closed service record with NO financial data.
        // Invoices/financials for imported history must be imported separately via the
        // dedicated invoice import flow — never inferred from appointment imports.
        if (isPast && appointment) {
          const serviceData = {
            user_id: user.id,
            customer_id: customerId,
            vehicle_id: vehicleId,
            service_date: scheduledDate,
            service_type: title,
            description: appointmentData.description || `Imported service: ${title}`,
            labor_cost: 0,
            parts_cost: 0,
            total_cost: 0,
            tax_amount: 0,
            discount_amount: 0,
            shop_supplies: 0,
            paid_amount: 0,
            payment_status: null as string | null,
            status: 'completed',
            notes: appointmentData.notes,
            technician: mapping.technician ? String(row[mapping.technician] || '').trim() || null : null,
          };

          const { error: serviceError } = await supabase
            .from('services')
            .insert(serviceData);

          if (serviceError) {
            errors.push(`Row ${i + 2}: Appointment created but service record failed - ${serviceError.message}`);
          }
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
