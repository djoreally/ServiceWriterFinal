export interface BusinessHours {
  opening_time: string;
  closing_time: string;
  working_days: string[];
  /** Booking slot increment in minutes. Same value used by the public booking flow. */
  slot_duration_minutes?: number;
  /** Minimum hours of lead time before a slot becomes bookable. */
  min_lead_time_hours?: number;
  /** Buffer in minutes added before/after each booked appointment. */
  buffer_time_before?: number;
  buffer_time_after?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address?: string;
  notes?: string;
  created_at?: string;
}

export interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  license_plate?: string;
  plate_state?: string;
  color?: string;
  mileage?: number;
  odometer_measure?: string;
  notes?: string;
  created_at?: string;
  customer_id?: string;
  oil_type?: string;
  oil_capacity?: string;
  engine?: string | null;
  tire_size?: string | null;
  tire_size_source?: string | null;
  tire_load_index?: string | null;
  tire_speed_rating?: string | null;
}

export interface ServiceCatalogItem {
  id: string;
  name: string;
  description: string;
  default_price: number;
  estimated_duration?: number;
  category?: string;
  is_active?: boolean;
}

export interface Appointment {
  id: string;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: string;
  customer?: Customer | null;
  vehicle?: Vehicle | null;
  // Guest booking fields
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  // Service catalog relationship
  service_catalog_id?: string | null;
  service_catalog?: ServiceCatalogItem | null;
  // Optional location fields (populated from Mapbox geocoding)
  location_address?: string;
  location_lat?: number;
  location_lng?: number;
  description?: string;
  notes?: string;
  estimated_cost?: number;
  tax_amount?: number;
  service_record_id?: string | null; // Link to the generated service record when completed
  // Dispatch fields
  dispatch_status?: string | null;
  assigned_technician_id?: string | null;
  assigned_van_id?: string | null;
}

// Calendar-specific appointment view with optional relations
export interface CalendarAppointment extends Appointment {
  customer: Customer | null;
  vehicle: Vehicle | null;
}

export interface RecurringService {
  id: string;
  user_id: string;
  service_catalog_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  frequency: 'days' | 'weeks' | 'months' | 'years';
  interval: number;
  start_date: string;
  next_due_date: string;
  is_active: boolean;
  created_at: string;
  service_catalog: ServiceCatalogItem;
  customer: Customer | null;
  vehicle: Vehicle | null;
}

// ── Subscription Plans ──────────────────────────────────────────────

export type BillingCycle = 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired' | 'past_due';
export type SubscriptionTier = 'essentials' | 'performance' | 'elite' | 'addon' | 'custom';

export interface SubscriptionPlan {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  price: number;
  billing_cycle: BillingCycle;
  features: string[];
  included_services: string[];       // service_catalog IDs or descriptions
  max_services_per_cycle: number | null;
  is_active: boolean;
  display_order: number;
  tier: SubscriptionTier | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  price_min: number | null;
  price_max: number | null;
  is_template: boolean;
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  cta_label: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional)
  service_catalog_items?: ServiceCatalogItem[];
  _subscriber_count?: number;
}

export interface CustomerSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  customer_id: string;
  vehicle_id: string | null;
  status: SubscriptionStatus;
  start_date: string;
  current_period_end: string | null;
  cancelled_at: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (optional)
  plan?: SubscriptionPlan;
  customer?: Customer;
  vehicle?: Vehicle;
}

export interface SubscriptionPlanTemplate {
  id: string;
  tier: SubscriptionTier;
  name: string;
  /** @deprecated use description */
  tagline: string | null;
  description: string | null;
  price_min: number | null;
  price_max: number | null;
  /** @deprecated use price */
  default_price: number;
  price: number;
  billing_cycle: BillingCycle;
  features: string[];
  included_services_description: string[];
  max_services_per_cycle: number | null;
  badge_label: string | null;
  badge_color: string | null;
  highlight: boolean;
  cta_label: string;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
