import {
  SERVICE_WRITER_ERROR_IMPACT_RANKING,
  SERVICE_WRITER_FEATURE_MODULES,
  SERVICE_WRITER_NORTH_STAR_FUNNEL_STEPS,
  SERVICE_WRITER_RETENTION_EVENTS,
  SERVICE_WRITER_REVENUE_DASHBOARD_METRICS,
  SERVICE_WRITER_REVENUE_EVENTS,
  SERVICE_WRITER_SESSION_REPLAY_PLAYLISTS,
  SERVICE_WRITER_TECHNICIAN_ANALYTICS_METRICS,
  SERVICE_WRITER_TECHNICIAN_WORKFLOW_EVENTS,
  SERVICE_WRITER_TTFV_MILESTONES,
  captureApplicationError,
  captureFeatureUsed,
  captureRetentionEvent,
  captureRevenueEvent,
  captureTechnicianWorkflowEvent,
  captureTimeToFirstValueMilestone,
  getOrganizationFeatureAdoptionScore,
  getTimeSinceSignupSeconds,
  isSensitiveServiceWriterProperty,
  sanitizeServiceWriterProperties,
} from "../service-writer";
import type { ServiceWriterErrorImpactProperties, ServiceWriterRevenueEventProperties, ServiceWriterTechnicianWorkflowProperties } from "../service-writer";

describe("Service Writer PostHog helpers", () => {
  it("detects PII-bearing property names across common casing styles", () => {
    expect(isSensitiveServiceWriterProperty("customer_name")).toBe(true);
    expect(isSensitiveServiceWriterProperty("customerName")).toBe(true);
    expect(isSensitiveServiceWriterProperty("VIN")).toBe(true);
    expect(isSensitiveServiceWriterProperty("licensePlate")).toBe(true);
    expect(isSensitiveServiceWriterProperty("message_body")).toBe(true);
    expect(isSensitiveServiceWriterProperty("payment_method")).toBe(false);
    expect(isSensitiveServiceWriterProperty("feature_name")).toBe(false);
    expect(isSensitiveServiceWriterProperty("module")).toBe(false);
    expect(isSensitiveServiceWriterProperty("time_since_signup")).toBe(false);
    expect(isSensitiveServiceWriterProperty("milestone")).toBe(false);
    expect(isSensitiveServiceWriterProperty("time_since_signup_minutes")).toBe(false);
    expect(isSensitiveServiceWriterProperty("organization_id")).toBe(false);
  });

  it("removes undefined and sensitive properties without dropping useful business context", () => {
    expect(sanitizeServiceWriterProperties({
      organization_id: "org_123",
      payment_method: "card_present",
      feature_name: "Inventory count",
      module: "Inventory",
      time_since_signup: 86400,
      customerName: "Jane Doe",
      vin: "1HGCM82633A004352",
      error_code: undefined,
    })).toEqual({
      organization_id: "org_123",
      payment_method: "card_present",
      feature_name: "Inventory count",
      module: "Inventory",
      time_since_signup: 86400,
    });
  });

  it("defines the initial product modules for the single feature_used event", () => {
    expect(SERVICE_WRITER_FEATURE_MODULES).toEqual([
      "Inventory",
      "Messages",
      "Newsletter",
      "Payments",
      "Marketplace",
      "Reports",
      "Inspections",
      "Coupons",
    ]);
  });

  it("captures module adoption through feature_used", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureFeatureUsed>[0];

    captureFeatureUsed(posthog, {
      organization_id: "org_123",
      feature_name: "Inventory item created",
      module: "Inventory",
      time_since_signup: 3600,
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("feature_used", expect.objectContaining({
      organization_id: "org_123",
      feature_name: "Inventory item created",
      module: "Inventory",
      time_since_signup: 3600,
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("feature_used", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("defines time-to-first-value milestones in funnel order", () => {
    expect(SERVICE_WRITER_TTFV_MILESTONES).toEqual([
      "signup",
      "first_customer",
      "first_vehicle",
      "first_appointment",
      "first_completed_appointment",
      "first_payment",
    ]);
  });

  it("calculates non-negative seconds since signup", () => {
    expect(getTimeSinceSignupSeconds("2026-07-15T00:00:00.000Z", "2026-07-15T00:14:30.000Z")).toBe(870);
    expect(getTimeSinceSignupSeconds("2026-07-15T00:14:30.000Z", "2026-07-15T00:00:00.000Z")).toBe(0);
  });

  it("captures time-to-first-value milestones for histogram analysis", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureTimeToFirstValueMilestone>[0];

    captureTimeToFirstValueMilestone(posthog, {
      organization_id: "org_123",
      milestone: "first_payment",
      time_since_signup: 172800,
      time_since_signup_minutes: 2880,
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("time_to_first_value_milestone", expect.objectContaining({
      organization_id: "org_123",
      milestone: "first_payment",
      time_since_signup: 172800,
      time_since_signup_minutes: 2880,
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("time_to_first_value_milestone", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("defines revenue dashboard metrics and source events", () => {
    expect(SERVICE_WRITER_REVENUE_DASHBOARD_METRICS).toEqual([
      "jobs",
      "average_invoice",
      "gross_payment_volume",
      "refund_rate",
      "failed_payments",
      "average_completion_time",
      "average_ticket",
      "revenue_by_organization",
      "revenue_by_technician",
    ]);
    expect(SERVICE_WRITER_REVENUE_EVENTS).toEqual([
      "job completed",
      "invoice created",
      "payment collected",
      "payment failed",
      "refund issued",
    ]);
  });

  it("captures revenue events with organization and technician dimensions", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureRevenueEvent>[0];
    const amountCents = 12999 as ServiceWriterRevenueEventProperties["amount_cents"];

    captureRevenueEvent(posthog, "payment collected", {
      organization_id: "org_123",
      technician_id: "tech_456",
      job_id: "job_789",
      invoice_id: "inv_123",
      payment_id: "pay_123",
      amount_cents: amountCents,
      completion_time_seconds: 5400,
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("payment collected", expect.objectContaining({
      organization_id: "org_123",
      technician_id: "tech_456",
      job_id: "job_789",
      invoice_id: "inv_123",
      payment_id: "pay_123",
      amount_cents: amountCents,
      completion_time_seconds: 5400,
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("payment collected", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("defines technician workflow events and metrics", () => {
    expect(SERVICE_WRITER_TECHNICIAN_WORKFLOW_EVENTS).toEqual([
      "technician assigned",
      "technician started",
      "technician arrived",
      "inspection completed",
      "work started",
      "job completed",
    ]);
    expect(SERVICE_WRITER_TECHNICIAN_ANALYTICS_METRICS).toEqual([
      "average_completion_time",
      "average_drive_time",
      "average_inspection_time",
      "average_service_time",
      "average_invoice",
      "average_upsell",
    ]);
  });

  it("captures technician workflow events with duration and value context", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureTechnicianWorkflowEvent>[0];
    const invoiceAmountCents = 24999 as ServiceWriterTechnicianWorkflowProperties["invoice_amount_cents"];
    const upsellAmountCents = 5000 as ServiceWriterTechnicianWorkflowProperties["upsell_amount_cents"];

    captureTechnicianWorkflowEvent(posthog, "job completed", {
      organization_id: "org_123",
      technician_id: "tech_456",
      job_id: "job_789",
      appointment_id: "appt_123",
      completion_time_seconds: 7200,
      drive_time_seconds: 900,
      inspection_time_seconds: 1200,
      service_time_seconds: 5100,
      invoice_amount_cents: invoiceAmountCents,
      upsell_amount_cents: upsellAmountCents,
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("job completed", expect.objectContaining({
      organization_id: "org_123",
      technician_id: "tech_456",
      job_id: "job_789",
      appointment_id: "appt_123",
      completion_time_seconds: 7200,
      drive_time_seconds: 900,
      inspection_time_seconds: 1200,
      service_time_seconds: 5100,
      invoice_amount_cents: invoiceAmountCents,
      upsell_amount_cents: upsellAmountCents,
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("job completed", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("defines the north-star organization funnel in dashboard order", () => {
    expect(SERVICE_WRITER_NORTH_STAR_FUNNEL_STEPS).toEqual([
      { label: "Organizations Created", event: "organization created" },
      { label: "Business Profile", event: "business profile completed" },
      { label: "Customer", event: "customer created" },
      { label: "Vehicle", event: "vehicle created" },
      { label: "Appointment", event: "appointment created" },
      { label: "Completed", event: "appointment completed" },
      { label: "Invoice", event: "invoice created" },
      { label: "Paid", event: "payment collected" },
    ]);
  });

  it("defines session replay playlists for failure and friction review", () => {
    expect(SERVICE_WRITER_SESSION_REPLAY_PLAYLISTS).toEqual([
      { name: "Payment Failed", trigger_event: "payment failed" },
      { name: "Appointment Failed", trigger_event: "appointment creation failed" },
      { name: "Customer Creation Failed", trigger_event: "customer creation failed" },
      { name: "Vehicle Decode Failed", trigger_event: "vehicle decode failed" },
      { name: "Abandoned Onboarding", trigger_event: "onboarding abandoned" },
      { name: "Repeated Clicking", trigger_event: "repeated clicking" },
      { name: "Unhandled Error", trigger_event: "application error" },
    ]);
  });

  it("defines retention events based on value delivered", () => {
    expect(SERVICE_WRITER_RETENTION_EVENTS).toEqual([
      "appointment completed",
      "job completed",
      "invoice created",
      "payment collected",
    ]);
  });

  it("captures retention through completed appointment value events", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureRetentionEvent>[0];

    captureRetentionEvent(posthog, "appointment completed", {
      organization_id: "org_123",
      appointment_id: "appt_123",
      technician_id: "tech_456",
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("appointment completed", expect.objectContaining({
      organization_id: "org_123",
      appointment_id: "appt_123",
      technician_id: "tech_456",
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("appointment completed", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("defines error impact ranking by business impact before occurrences", () => {
    expect(SERVICE_WRITER_ERROR_IMPACT_RANKING).toEqual([
      "revenue_affected",
      "paying_organizations_affected",
      "organizations_affected",
      "blocking_workflow",
      "occurrences",
    ]);
  });

  it("captures application errors with workflow and revenue impact context", () => {
    const posthog = { capture: jest.fn() } as unknown as Parameters<typeof captureApplicationError>[0];
    const revenueAffectedCents = 49999 as ServiceWriterErrorImpactProperties["revenue_affected_cents"];

    captureApplicationError(posthog, {
      organization_id: "org_123",
      user_role: "technician",
      page: "/appointments/appt_123",
      workflow: "appointment_completion",
      version: "2026.07.15",
      edge_function: "complete-appointment",
      revenue_affected_cents: revenueAffectedCents,
      error_code: "EDGE_TIMEOUT",
      customerName: "Jane Doe",
    });

    expect(posthog?.capture).toHaveBeenCalledWith("application error", expect.objectContaining({
      organization_id: "org_123",
      user_role: "technician",
      page: "/appointments/appt_123",
      workflow: "appointment_completion",
      version: "2026.07.15",
      edge_function: "complete-appointment",
      revenue_affected_cents: revenueAffectedCents,
      error_code: "EDGE_TIMEOUT",
    }));
    expect(posthog?.capture).toHaveBeenCalledWith("application error", expect.not.objectContaining({
      customerName: "Jane Doe",
    }));
  });

  it("scores organization feature adoption once per adopted behavior", () => {
    expect(getOrganizationFeatureAdoptionScore([
      "customer created",
      "customer created",
      "vehicle created",
      "appointment created",
      "appointment completed",
      "payment collected",
      "unknown event",
    ])).toBe(10);
  });
});
