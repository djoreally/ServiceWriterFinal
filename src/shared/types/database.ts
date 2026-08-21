/**
 * @module Database Types
 * Type-safe wrappers for database query results
 */

import type { Database } from "@/integrations/supabase/types";

// ============= Table Row Types =============

export type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
export type AppointmentInsert = Database["public"]["Tables"]["appointments"]["Insert"];
export type AppointmentUpdate = Database["public"]["Tables"]["appointments"]["Update"];

export type CustomerRow = Database["public"]["Tables"]["customers"]["Row"];
export type CustomerInsert = Database["public"]["Tables"]["customers"]["Insert"];
export type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

export type VehicleRow = Database["public"]["Tables"]["vehicles"]["Row"];
export type VehicleInsert = Database["public"]["Tables"]["vehicles"]["Insert"];
export type VehicleUpdate = Database["public"]["Tables"]["vehicles"]["Update"];

export type ServiceRow = Database["public"]["Tables"]["services"]["Row"];
export type ServiceInsert = Database["public"]["Tables"]["services"]["Insert"];
export type ServiceUpdate = Database["public"]["Tables"]["services"]["Update"];

export type ServiceCatalogRow = Database["public"]["Tables"]["service_catalog"]["Row"];
export type ServiceCatalogInsert = Database["public"]["Tables"]["service_catalog"]["Insert"];
export type ServiceCatalogUpdate = Database["public"]["Tables"]["service_catalog"]["Update"];

export type BusinessProfileRow = Database["public"]["Tables"]["business_profiles"]["Row"];
export type BusinessProfileInsert = Database["public"]["Tables"]["business_profiles"]["Insert"];
export type BusinessProfileUpdate = Database["public"]["Tables"]["business_profiles"]["Update"];

export type PaymentRecordRow = Database["public"]["Tables"]["payment_records"]["Row"];
export type PaymentRecordInsert = Database["public"]["Tables"]["payment_records"]["Insert"];
export type PaymentRecordUpdate = Database["public"]["Tables"]["payment_records"]["Update"];

export type IntakeQuestionRow = Database["public"]["Tables"]["intake_questions"]["Row"];
export type IntakeQuestionInsert = Database["public"]["Tables"]["intake_questions"]["Insert"];
export type IntakeQuestionUpdate = Database["public"]["Tables"]["intake_questions"]["Update"];

// ============= Joined Query Types =============

export interface AppointmentWithRelations extends AppointmentRow {
  customer: CustomerRow | null;
  vehicle: VehicleRow | null;
  service_catalog: ServiceCatalogRow | null;
}

export interface VehicleWithCustomer extends VehicleRow {
  customer: CustomerRow | null;
}

// ============= Type Guards =============

export function isAppointmentRow(obj: unknown): obj is AppointmentRow {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "scheduled_date" in obj &&
    "scheduled_time" in obj
  );
}

export function isCustomerRow(obj: unknown): obj is CustomerRow {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "name" in obj &&
    "user_id" in obj
  );
}

export function isVehicleRow(obj: unknown): obj is VehicleRow {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "id" in obj &&
    "make" in obj &&
    "model" in obj &&
    "year" in obj
  );
}
