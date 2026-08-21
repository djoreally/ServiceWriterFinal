/**
 * Service Records Query — Read operations for the Services page.
 */
import { supabase } from '@/integrations/supabase/client';

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface ServiceRecordRow {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  service_date: string;
  service_type: string;
  description: string;
  parts_used: string | null;
  labor_hours: number | null;
  labor_cost: number | null;
  parts_cost: number | null;
  total_cost: number;
  status: string;
  notes: string | null;
  technician: string | null;
}

interface CustomerRef {
  id: string;
  name: string;
}

interface VehicleRef {
  id: string;
  customer_id: string | null;
  make: string;
  model: string;
  year: number;
}

export interface ServiceRecordsPageData {
  services: ServiceRecordRow[];
  customers: CustomerRef[];
  vehicles: VehicleRef[];
  userId: string;
}

/** Fetch all data needed for the Services page in a single parallel call */
export async function fetchServiceRecordsPageData(): Promise<ServiceRecordsPageData | null> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) return null;

  const [servicesRes, customersRes, vehiclesRes] = await Promise.all([
    supabase.from('services').select('*').order('service_date', { ascending: false }),
    supabase.from('customers').select('id, name'),
    supabase.from('vehicles').select('id, customer_id, make, model, year'),
  ]);

  return {
    services: (servicesRes.data ?? []) as ServiceRecordRow[],
    customers: (customersRes.data ?? []) as CustomerRef[],
    vehicles: (vehiclesRes.data ?? []) as VehicleRef[],
    userId: user.id,
  };
}
