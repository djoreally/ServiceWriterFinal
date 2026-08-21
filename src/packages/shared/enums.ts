/**
 * @package @packages/shared
 * Shared enums used across all apps
 */

// ============= Service Status =============

export enum ServiceStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

// ============= Appointment Status =============

export enum AppointmentStatus {
  Scheduled = 'scheduled',
  Confirmed = 'confirmed',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
  NoShow = 'no_show',
}

// ============= Quote Status =============

export enum QuoteStatus {
  Draft = 'draft',
  Sent = 'sent',
  Approved = 'approved',
  Rejected = 'rejected',
  Expired = 'expired',
}

// ============= Campaign Status =============

export enum CampaignStatus {
  Draft = 'draft',
  Scheduled = 'scheduled',
  Sent = 'sent',
}

// ============= Email Queue Status =============

export enum EmailQueueStatus {
  Pending = 'pending',
  Sent = 'sent',
  Failed = 'failed',
}

// ============= Payment Status =============

export enum PaymentStatus {
  Pending = 'pending',
  Processing = 'processing',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Refunded = 'refunded',
  PartiallyRefunded = 'partially_refunded',
}

// ============= Payment Type =============

export enum PaymentType {
  Stripe = 'stripe',
  Cash = 'cash',
  Check = 'check',
  CardOnFile = 'card_on_file',
  Other = 'other',
}

// ============= User Role =============

export enum UserRole {
  Admin = 'admin',
  TenantOwner = 'tenant_owner',
  TenantStaff = 'tenant_staff',
  Customer = 'customer',
}

// ============= Recurring Frequency =============

export enum RecurringFrequency {
  Days = 'days',
  Weeks = 'weeks',
  Months = 'months',
  Years = 'years',
}

// ============= Review Platform =============

export enum ReviewPlatform {
  Google = 'google',
  Yelp = 'yelp',
  Both = 'both',
}

// ============= Discount Type =============

export enum DiscountType {
  Percentage = 'percentage',
  Fixed = 'fixed',
}
