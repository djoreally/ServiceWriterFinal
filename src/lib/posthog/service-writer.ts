import type posthogJs from "posthog-js";
import type { Cents } from "@/lib/money";
import { getRuntimeEnvString } from "@/lib/runtime-env";

export const SERVICE_WRITER_CORE_EVENTS = [
  "organization created",
  "onboarding completed",
  "business profile completed",
  "customer created",
  "vehicle created",
  "appointment created",
  "appointment completed",
  "technician assigned",
  "technician started",
  "technician arrived",
  "inspection completed",
  "work started",
  "job completed",
  "invoice created",
  "payment collected",
  "payment failed",
  "refund issued",
  "team member invited",
  "feature_used",
  "application error",
  "time_to_first_value_milestone",
] as const;

export type ServiceWriterCoreEvent = (typeof SERVICE_WRITER_CORE_EVENTS)[number];

export const SERVICE_WRITER_FEATURE_MODULES = [
  "Inventory",
  "Messages",
  "Newsletter",
  "Payments",
  "Marketplace",
  "Reports",
  "Inspections",
  "Coupons",
] as const;

export type ServiceWriterFeatureModule = (typeof SERVICE_WRITER_FEATURE_MODULES)[number];

export const SERVICE_WRITER_TTFV_MILESTONES = [
  "signup",
  "first_customer",
  "first_vehicle",
  "first_appointment",
  "first_completed_appointment",
  "first_payment",
] as const;

export type ServiceWriterTimeToFirstValueMilestone = (typeof SERVICE_WRITER_TTFV_MILESTONES)[number];

export const SERVICE_WRITER_REVENUE_DASHBOARD_METRICS = [
  "jobs",
  "average_invoice",
  "gross_payment_volume",
  "refund_rate",
  "failed_payments",
  "average_completion_time",
  "average_ticket",
  "revenue_by_organization",
  "revenue_by_technician",
] as const;

export type ServiceWriterRevenueDashboardMetric = (typeof SERVICE_WRITER_REVENUE_DASHBOARD_METRICS)[number];

export const SERVICE_WRITER_REVENUE_EVENTS = [
  "job completed",
  "invoice created",
  "payment collected",
  "payment failed",
  "refund issued",
] as const satisfies readonly ServiceWriterCoreEvent[];

export type ServiceWriterRevenueEvent = (typeof SERVICE_WRITER_REVENUE_EVENTS)[number];

export const SERVICE_WRITER_TECHNICIAN_WORKFLOW_EVENTS = [
  "technician assigned",
  "technician started",
  "technician arrived",
  "inspection completed",
  "work started",
  "job completed",
] as const satisfies readonly ServiceWriterCoreEvent[];

export type ServiceWriterTechnicianWorkflowEvent = (typeof SERVICE_WRITER_TECHNICIAN_WORKFLOW_EVENTS)[number];

export const SERVICE_WRITER_TECHNICIAN_ANALYTICS_METRICS = [
  "average_completion_time",
  "average_drive_time",
  "average_inspection_time",
  "average_service_time",
  "average_invoice",
  "average_upsell",
] as const;

export type ServiceWriterTechnicianAnalyticsMetric = (typeof SERVICE_WRITER_TECHNICIAN_ANALYTICS_METRICS)[number];

export const SERVICE_WRITER_RETENTION_EVENTS = [
  "appointment completed",
  "job completed",
  "invoice created",
  "payment collected",
] as const satisfies readonly ServiceWriterCoreEvent[];

export type ServiceWriterRetentionEvent = (typeof SERVICE_WRITER_RETENTION_EVENTS)[number];

export const SERVICE_WRITER_ERROR_IMPACT_RANKING = [
  "revenue_affected",
  "paying_organizations_affected",
  "organizations_affected",
  "blocking_workflow",
  "occurrences",
] as const;

export type ServiceWriterErrorImpactRanking = (typeof SERVICE_WRITER_ERROR_IMPACT_RANKING)[number];

export const SERVICE_WRITER_NORTH_STAR_FUNNEL_STEPS = [
  { label: "Organizations Created", event: "organization created" },
  { label: "Business Profile", event: "business profile completed" },
  { label: "Customer", event: "customer created" },
  { label: "Vehicle", event: "vehicle created" },
  { label: "Appointment", event: "appointment created" },
  { label: "Completed", event: "appointment completed" },
  { label: "Invoice", event: "invoice created" },
  { label: "Paid", event: "payment collected" },
] as const satisfies readonly { label: string; event: ServiceWriterCoreEvent }[];

export type ServiceWriterNorthStarFunnelStep = (typeof SERVICE_WRITER_NORTH_STAR_FUNNEL_STEPS)[number];

export const SERVICE_WRITER_SESSION_REPLAY_PLAYLISTS = [
  { name: "Payment Failed", trigger_event: "payment failed" },
  { name: "Appointment Failed", trigger_event: "appointment creation failed" },
  { name: "Customer Creation Failed", trigger_event: "customer creation failed" },
  { name: "Vehicle Decode Failed", trigger_event: "vehicle decode failed" },
  { name: "Abandoned Onboarding", trigger_event: "onboarding abandoned" },
  { name: "Repeated Clicking", trigger_event: "repeated clicking" },
  { name: "Unhandled Error", trigger_event: "application error" },
] as const;

export type ServiceWriterSessionReplayPlaylist = (typeof SERVICE_WRITER_SESSION_REPLAY_PLAYLISTS)[number];

export interface ServiceWriterEventProperties {
  organization_id?: string;
  user_role?: string;
  subscription_plan?: string;
  device_type?: "desktop" | "tablet" | "mobile" | "unknown";
  app_version?: string;
  environment?: string;
  version?: string;
  page?: string;
  workflow?: string;
  edge_function?: string;
  feature_source?: string;
  feature_name?: string;
  module?: ServiceWriterFeatureModule | string;
  time_since_signup?: number;
  time_since_signup_minutes?: number;
  milestone?: ServiceWriterTimeToFirstValueMilestone | string;
  creation_source?: string;
  location_id?: string;
  technician_id?: string;
  job_id?: string;
  appointment_id?: string;
  invoice_id?: string;
  payment_id?: string;
  service_category?: string;
  customer_type?: "new" | "returning" | "unknown";
  job_status?: string;
  payment_method?: string;
  amount_cents?: Cents;
  invoice_amount_cents?: Cents;
  refund_amount_cents?: Cents;
  revenue_affected_cents?: Cents;
  duration_seconds?: number;
  completion_time_seconds?: number;
  drive_time_seconds?: number;
  inspection_time_seconds?: number;
  service_time_seconds?: number;
  upsell_amount_cents?: Cents;
  error_code?: string;
  [key: string]: string | number | boolean | null | undefined;
}

const SENSITIVE_PROPERTY_KEYWORDS = [
  "address",
  "card",
  "cardnumber",
  "customercontact",
  "customeremail",
  "customername",
  "customerphone",
  "document",
  "email",
  "fullname",
  "inspectionnote",
  "licenseplate",
  "messagebody",
  "phone",
  "signature",
  "vin",
];

const ADOPTION_EVENT_WEIGHTS: Partial<Record<ServiceWriterCoreEvent, number>> = {
  "customer created": 1,
  "vehicle created": 1,
  "appointment created": 2,
  "appointment completed": 3,
  "payment collected": 3,
  "team member invited": 1,
};

export function isSensitiveServiceWriterProperty(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return SENSITIVE_PROPERTY_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export function sanitizeServiceWriterProperties(
  properties: ServiceWriterEventProperties,
): ServiceWriterEventProperties {
  return Object.fromEntries(
    Object.entries(properties).filter(([key, value]) => {
      if (value === undefined) return false;
      return !isSensitiveServiceWriterProperty(key);
    }),
  ) as ServiceWriterEventProperties;
}

export function getDeviceType(): ServiceWriterEventProperties["device_type"] {
  if (typeof window === "undefined") return "unknown";
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function getOrganizationFeatureAdoptionScore(events: Iterable<string>): number {
  const uniqueEvents = new Set(events);
  return Object.entries(ADOPTION_EVENT_WEIGHTS).reduce((score, [event, weight]) => {
    return uniqueEvents.has(event) ? score + weight : score;
  }, 0);
}

export function captureServiceWriterEvent(
  posthog: typeof posthogJs | undefined,
  event: ServiceWriterCoreEvent,
  properties: ServiceWriterEventProperties = {},
) {
  if (!posthog?.capture) return;
  posthog.capture(event, sanitizeServiceWriterProperties({
    device_type: getDeviceType(),
    app_version: getRuntimeEnvString("VITE_APP_VERSION") ?? getRuntimeEnvString("VITE_COMMIT_SHA"),
    environment: getRuntimeEnvString("MODE") ?? getRuntimeEnvString("NODE_ENV"),
    ...properties,
  }));
}

export interface ServiceWriterFeatureUsedProperties extends ServiceWriterEventProperties {
  feature_name: string;
  module: ServiceWriterFeatureModule | string;
  time_since_signup?: number;
  organization_id: string;
}

export function captureFeatureUsed(
  posthog: typeof posthogJs | undefined,
  properties: ServiceWriterFeatureUsedProperties,
) {
  captureServiceWriterEvent(posthog, "feature_used", properties);
}

export interface ServiceWriterTimeToFirstValueProperties extends ServiceWriterEventProperties {
  organization_id: string;
  milestone: ServiceWriterTimeToFirstValueMilestone;
  time_since_signup: number;
  time_since_signup_minutes: number;
}

export function getTimeSinceSignupSeconds(signupAt: string | Date, occurredAt: string | Date = new Date()): number {
  const signupTime = new Date(signupAt).getTime();
  const occurredTime = new Date(occurredAt).getTime();
  if (!Number.isFinite(signupTime) || !Number.isFinite(occurredTime)) return 0;
  return Math.max(Math.floor((occurredTime - signupTime) / 1000), 0);
}

export function captureTimeToFirstValueMilestone(
  posthog: typeof posthogJs | undefined,
  properties: ServiceWriterTimeToFirstValueProperties,
) {
  captureServiceWriterEvent(posthog, "time_to_first_value_milestone", properties);
}

export interface ServiceWriterRevenueEventProperties extends ServiceWriterEventProperties {
  organization_id: string;
  technician_id?: string;
  job_id?: string;
  appointment_id?: string;
  invoice_id?: string;
  payment_id?: string;
  amount_cents?: Cents;
  invoice_amount_cents?: Cents;
  refund_amount_cents?: Cents;
  completion_time_seconds?: number;
}

export interface ServiceWriterTechnicianWorkflowProperties extends ServiceWriterEventProperties {
  organization_id: string;
  technician_id: string;
  job_id?: string;
  appointment_id?: string;
  invoice_amount_cents?: Cents;
  upsell_amount_cents?: Cents;
  completion_time_seconds?: number;
  drive_time_seconds?: number;
  inspection_time_seconds?: number;
  service_time_seconds?: number;
}

export function captureTechnicianWorkflowEvent(
  posthog: typeof posthogJs | undefined,
  event: ServiceWriterTechnicianWorkflowEvent,
  properties: ServiceWriterTechnicianWorkflowProperties,
) {
  captureServiceWriterEvent(posthog, event, properties);
}

export interface ServiceWriterRetentionEventProperties extends ServiceWriterEventProperties {
  organization_id: string;
}

export function captureRetentionEvent(
  posthog: typeof posthogJs | undefined,
  event: ServiceWriterRetentionEvent,
  properties: ServiceWriterRetentionEventProperties,
) {
  captureServiceWriterEvent(posthog, event, properties);
}

export interface ServiceWriterErrorImpactProperties extends ServiceWriterEventProperties {
  organization_id: string;
  user_role: string;
  page: string;
  workflow: string;
  version: string;
  edge_function?: string;
  revenue_affected_cents?: Cents;
  error_code?: string;
}

export function captureApplicationError(
  posthog: typeof posthogJs | undefined,
  properties: ServiceWriterErrorImpactProperties,
) {
  captureServiceWriterEvent(posthog, "application error", properties);
}

export function captureRevenueEvent(
  posthog: typeof posthogJs | undefined,
  event: ServiceWriterRevenueEvent,
  properties: ServiceWriterRevenueEventProperties,
) {
  captureServiceWriterEvent(posthog, event, properties);
}
