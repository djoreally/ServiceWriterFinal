/**
 * @module Form Types
 * Typed interfaces for all form data across the application
 */

// ============= Appointment Form Types =============

/** Form submission data - all required fields for creating/updating appointments */
export interface AppointmentFormData {
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status?: AppointmentStatus;
  customer_id?: string | null;
  vehicle_id?: string | null;
  service_catalog_id?: string | null;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  description?: string;
  notes?: string;
  estimated_cost?: number;
  tax_amount?: number;
  user_id?: string;
  sendEmailNotification?: boolean;
  // Vehicle info for notifications
  vehicle_year?: number;
  vehicle_make?: string;
  vehicle_model?: string;
}

/** Partial form state used during form editing - more relaxed for UI state */
export interface AppointmentFormState {
  id?: string;
  title?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  duration_minutes?: number;
  status?: string;
  customer_id?: string | null;
  vehicle_id?: string | null;
  service_catalog_id?: string | null;
  guest_name?: string;
  guest_email?: string;
  guest_phone?: string;
  description?: string;
  notes?: string;
  estimated_cost?: number;
  tax_amount?: number;
  user_id?: string;
  sendEmailNotification?: boolean;
  vehicle_year?: number | string;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_license?: string;
  // Service-location snapshot for this appointment
  location_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_postal_code?: string | null;
  // Allow joined relations for initialData
  customer?: unknown;
  vehicle?: unknown;
  service_catalog?: unknown;
}

export type AppointmentStatus = 
  | "scheduled" 
  | "confirmed" 
  | "in_progress" 
  | "completed" 
  | "cancelled" 
  | "no_show";

// ============= Customer Form Types =============

export interface CustomerFormData {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

// ============= Vehicle Form Types =============

export interface VehicleFormData {
  id?: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  license_plate?: string;
  plate_state?: string;
  color?: string;
  mileage?: number;
  odometer_measure?: "MI" | "KM";
  oil_type?: string;
  oil_capacity?: string;
  notes?: string;
  customer_id?: string;
}

// ============= Service Record Form Types =============

export interface ServiceRecordFormData {
  service_type: string;
  description: string;
  service_date: string;
  labor_hours?: string;
  labor_cost?: string;
  parts_cost?: string;
  total_cost: string;
  status: ServiceRecordStatus;
  notes?: string;
  technician?: string;
  parts_used?: string;
}

export type ServiceRecordStatus = 
  | "pending" 
  | "in_progress" 
  | "completed" 
  | "cancelled";

// ============= Business Profile Form Types =============

export interface BusinessProfileFormData {
  user_id: string;
  business_name?: string;
  owner_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  logo_url?: string | null;
  terminology?: TerminologySettings;
  date_format?: string;
  timezone?: string;
  currency?: string;
  opening_time?: string;
  closing_time?: string;
  working_days?: string[];
  booking_slug?: string | null;
  service_radius_miles?: number;
  service_address?: string;
  service_coordinates?: GeoCoordinates | null;
  day_hours?: DayHoursConfig;
  tax_rate?: number;
  onboarding_completed?: boolean;
  onboarding_step?: number;
}

export interface TerminologySettings {
  appointment: string;
  customer: string;
  vehicle: string;
  service: string;
}

export interface GeoCoordinates {
  lat: number;
  lng: number;
}

export interface DayHoursEntry {
  open: string;
  close: string;
  isOpen: boolean;
}

export type DayHoursConfig = Record<string, DayHoursEntry>;

// ============= Service Catalog Form Types =============

export interface ServiceCatalogFormData {
  name: string;
  description: string;
  default_price: number;
  estimated_duration?: number;
  category?: string;
  is_active?: boolean;
}

// ============= Intake Question Types =============

export type QuestionType = "text" | "select" | "multiselect" | "boolean" | "number";

export interface IntakeQuestionFormData {
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  is_required?: boolean;
  sort_order?: number;
  is_active?: boolean;
}

// ============= Selection Mode Types =============

export type CustomerMode = "new" | "existing";
export type VehicleMode = "new" | "existing";
export type DropOffOption = "dropoff" | "wait" | "mobile";

// ============= Audit Log Types =============

export interface AuditLogDetails {
  [key: string]: unknown;
}

export interface AuditLogEvent {
  user_id: string | null;
  action: string;
  entity?: string;
  entity_id?: string;
  status: "success" | "failure";
  ip?: string;
  details?: AuditLogDetails;
}
