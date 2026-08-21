import { z } from 'zod';
import { APPOINTMENT_LIFECYCLE } from '@packages/shared/lifecycle';

// Enums for status fields, matching the PostgreSQL enums
export const ServiceStatus = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);
export const QuoteStatus = z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']);
export const CampaignStatus = z.enum(['draft', 'scheduled', 'sent']);
export const EmailQueueStatus = z.enum(['pending', 'sent', 'failed']);
export const AppointmentStatus = z.enum(APPOINTMENT_LIFECYCLE);
export const ReviewRequestStatus = z.enum(['pending', 'sent', 'completed']);
export const DiscountType = z.enum(['percentage', 'fixed']);

// Base schema for tables with user_id and timestamps
const BaseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

// Schema for 'customers' table
export const CustomerSchema = BaseSchema.extend({
  name: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
});

// Schema for 'vehicles' table
export const VehicleSchema = BaseSchema.extend({
  customer_id: z.string().uuid().nullable(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  vin: z.string().nullable(),
  license_plate: z.string().nullable(),
  color: z.string().nullable(),
  mileage: z.number().int().nullable(),
  notes: z.string().nullable(),
});

// Schema for 'appointments' table
export const AppointmentSchema = BaseSchema.extend({
  customer_id: z.string().uuid().nullable(),
  vehicle_id: z.string().uuid().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  scheduled_date: z.string(),
  scheduled_time: z.string(),
  duration_minutes: z.number().int(),
  status: AppointmentStatus,
  estimated_cost: z.number().nullable(),
  notes: z.string().nullable(),
});

// Schema for 'services' table
export const ServiceSchema = BaseSchema.extend({
  customer_id: z.string().uuid().nullable(),
  vehicle_id: z.string().uuid().nullable(),
  appointment_id: z.string().uuid().nullable(),
  service_type: z.string(),
  description: z.string(),
  service_date: z.string(),
  labor_hours: z.number().nullable(),
  labor_cost: z.number().nullable(),
  parts_cost: z.number().nullable(),
  total_cost: z.number(),
  technician: z.string().nullable(),
  notes: z.string().nullable(),
  status: ServiceStatus,
});

// Schema for 'quotes' table
export const QuoteSchema = BaseSchema.extend({
  customer_id: z.string().uuid().nullable(),
  vehicle_id: z.string().uuid().nullable(),
  quote_number: z.string(),
  description: z.string(),
  labor_hours: z.number().nullable(),
  labor_cost: z.number().nullable(),
  parts_cost: z.number().nullable(),
  total_cost: z.number(),
  valid_until: z.string().nullable(),
  notes: z.string().nullable(),
  status: QuoteStatus,
});

// Schema for 'inventory_items' table
export const InventoryItemSchema = BaseSchema.extend({
  name: z.string(),
  sku: z.string().nullable(),
  quantity: z.number().int(),
  unit_cost: z.number().nullable(),
  sell_price: z.number().nullable(),
  category: z.string().nullable(),
  low_stock_threshold: z.number().int().nullable(),
  description: z.string().nullable(),
});

// Schema for 'service_catalog' table
export const ServiceCatalogSchema = BaseSchema.extend({
  name: z.string(),
  description: z.string().nullable(),
  default_price: z.number(),
  estimated_duration: z.number().int().nullable(),
  category: z.string().nullable(),
  is_active: z.boolean(),
});

// Schema for 'email_marketing_campaigns' table
export const EmailMarketingCampaignSchema = BaseSchema.extend({
  name: z.string(),
  subject: z.string(),
  content: z.string(),
  recipient_type: z.string(), // Consider an enum: 'all', 'recent', 'inactive'
  status: CampaignStatus,
  scheduled_at: z.string().datetime().nullable(),
  sent_at: z.string().datetime().nullable(),
  recipient_count: z.number().int().nullable(),
  open_count: z.number().int().nullable(),
  click_count: z.number().int().nullable(),
});

// Schema for 'email_queue' table
export const EmailQueueSchema = BaseSchema.extend({
  customer_id: z.string().uuid().nullable(),
  appointment_id: z.string().uuid().nullable(),
  email_type: z.string(), // Consider an enum for different email types
  recipient_email: z.string().email(),
  recipient_name: z.string().nullable(),
  status: EmailQueueStatus,
  scheduled_for: z.string().datetime(),
  sent_at: z.string().datetime().nullable(),
  error_message: z.string().nullable(),
  metadata: z.record(z.string(), z.any()).nullable(), // For flexible data like campaign details
});

// Schema for 'business_profiles' table
export const BusinessProfileSchema = BaseSchema.extend({
  business_name: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  website: z.string().url().nullable(),
  opening_time: z.string().nullable(),
  closing_time: z.string().nullable(),
  working_days: z.array(z.string()).nullable(),
  booking_slug: z.string().nullable(),
});

// Schema for 'service_reminders' table
export const ServiceReminderSchema = BaseSchema.extend({
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable(),
  service_type: z.string(),
  reminder_date: z.string(),
  status: z.enum(['scheduled', 'sent']),
});

// Schema for 'review_requests' table
export const ReviewRequestSchema = BaseSchema.extend({
  customer_id: z.string().uuid(),
  service_id: z.string().uuid().nullable(),
  recipient_email: z.string().email(),
  recipient_name: z.string().nullable(),
  platform: z.enum(['google', 'yelp', 'both']),
  status: ReviewRequestStatus,
});

// Schema for 'blocked_dates' table
export const BlockedDateSchema = BaseSchema.extend({
  blocked_date: z.string(),
  reason: z.string().nullable(),
});

// Schema for 'coupon_codes' table
export const CouponCodeSchema = BaseSchema.extend({
  code: z.string(),
  discount_type: DiscountType,
  discount_value: z.number(),
  description: z.string().nullable(),
  valid_from: z.string().datetime().nullable(),
  valid_until: z.string().datetime().nullable(),
  max_uses: z.number().int().nullable(),
  min_order_amount: z.number().nullable(),
  is_active: z.boolean(),
});
