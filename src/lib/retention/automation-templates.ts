/**
 * Preconfigured automation rule templates.
 * Each template = a fully wired retention automation rule (trigger + actions + cooldown)
 * that can be seeded with one click.
 *
 * Action `body` strings support {{variables}} that are resolved at send time:
 *   {{customer_name}} {{customer_first_name}} {{vehicle}} {{shop_name}}
 *   {{discount_code}} {{discount_amount}} {{points}} {{review_url}} {{booking_url}}
 */

export type AutomationTriggerType =
  | "signal.winback_candidate"
  | "signal.vehicle_overdue"
  | "signal.vehicle_at_risk"
  | "signal.payment_received"
  | "signal.appointment_cancelled"
  | "signal.loyalty_milestone"
  | "signal.birthday"
  | "signal.service_completed"
  | "signal.appointment_booked"
  | "signal.subscription_expiring"
  | "signal.booking_abandoned";

export type AutomationActionType =
  | "send_email"
  | "send_sms"
  | "award_points"
  | "issue_reward"
  | "create_task"
  | "update_segment";

export interface AutomationTemplateAction {
  type: AutomationActionType;
  /** Optional template name/id reference (used by send-email / sms-send if present). */
  template?: string;
  /** Optional inline subject (email only). */
  subject?: string;
  /** Optional inline body — supports {{variables}}. */
  body?: string;
  /** Misc structured config (points, segment, task description, delay_minutes, etc.). */
  config?: Record<string, string | number | boolean>;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  category: "winback" | "reminder" | "review" | "loyalty" | "recovery" | "celebration";
  priority: number;
  trigger: AutomationTriggerType;
  /** Optional condition predicates evaluated at runtime against the signal payload. */
  conditions?: {
    /** e.g. { score: { gte: 0.6 }, days_overdue: { gte: 30 } } */
    [field: string]: { gte?: number; lte?: number; eq?: string | number; in?: (string | number)[] };
  };
  /** Audience targeting filters applied to the customer record. */
  audience?: {
    minLifetimeValue?: number;
    segments?: string[];
    tags?: string[];
  };
  /** Cooldown — minimum hours between firings of this rule for the same customer. */
  cooldownHours: number;
  actions: AutomationTemplateAction[];
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: "winback_lapsed",
    name: "Win-back Lapsed Customers",
    tagline: "Re-engage customers who haven't visited in 90+ days",
    icon: "🎯",
    category: "winback",
    priority: 80,
    trigger: "signal.winback_candidate",
    conditions: { score: { gte: 0.6 } },
    cooldownHours: 60 * 24, // 60 days
    actions: [
      {
        type: "send_sms",
        body: "Hi {{customer_first_name}}! It's been a while — we miss seeing your {{vehicle}}. Here's 15% off your next service: {{discount_code}}. Book: {{booking_url}}",
        config: { discount_percent: 15 },
      },
      {
        type: "send_email",
        template: "winback",
        subject: "We miss you, {{customer_first_name}} — 15% off your next visit",
        body: "Hi {{customer_first_name}},\n\nIt's been a while since we serviced your {{vehicle}}. As a thank-you for your past business, here's 15% off your next service.\n\nUse code: {{discount_code}}\nBook online: {{booking_url}}\n\nWe'd love to see you again,\n{{shop_name}}",
        config: { discount_percent: 15 },
      },
    ],
  },
  {
    id: "overdue_service_reminder",
    name: "Overdue Service Reminder",
    tagline: "Notify customers when their vehicle is due for service",
    icon: "🔧",
    category: "reminder",
    priority: 75,
    trigger: "signal.vehicle_overdue",
    conditions: { days_overdue: { gte: 14 } },
    cooldownHours: 14 * 24, // 14 days
    actions: [
      {
        type: "send_sms",
        body: "Hi {{customer_first_name}}, your {{vehicle}} is due for service. Reply YES to book or visit {{booking_url}}.",
      },
      {
        type: "create_task",
        config: {
          description: "Follow up with {{customer_name}} about overdue service on {{vehicle}}",
          priority: "high",
          due_in_days: 3,
        },
      },
    ],
  },
  {
    id: "post_service_review",
    name: "Post-Service Review Request",
    tagline: "Ask happy customers for a review 24h after payment",
    icon: "⭐",
    category: "review",
    priority: 60,
    trigger: "signal.payment_received",
    cooldownHours: 90 * 24, // 90 days per customer
    actions: [
      {
        type: "send_email",
        template: "review_request",
        subject: "How was your visit, {{customer_first_name}}?",
        body: "Hi {{customer_first_name}},\n\nThanks for trusting us with your {{vehicle}} yesterday. If we earned a 5-star experience, would you mind leaving a quick review?\n\n👉 {{review_url}}\n\nIt takes 30 seconds and helps a ton.\n\n— {{shop_name}}",
        config: { delay_minutes: 1440 }, // 24h delay
      },
    ],
  },
  {
    id: "review_on_completion",
    name: "Review Request on Service Completion",
    tagline: "Ask for a review after completed services even when payment is separate",
    icon: "⭐",
    category: "review",
    priority: 60,
    trigger: "signal.service_completed",
    cooldownHours: 90 * 24, // 90 days per customer
    actions: [
      {
        type: "send_email",
        template: "review_request",
        subject: "How was your visit, {{customer_first_name}}?",
        body: "Hi {{customer_first_name}},\n\nThanks for trusting us with your {{vehicle}}. If we earned a 5-star experience, would you mind leaving a quick review?\n\n👉 {{review_url}}\n\nIt takes 30 seconds and helps a ton.\n\n— {{shop_name}}",
        config: { delay_minutes: 1440 }, // 24h delay
      },
    ],
  },
  {
    id: "loyalty_milestone",
    name: "Loyalty Milestone Celebration",
    tagline: "Reward customers when they hit point thresholds",
    icon: "🏆",
    category: "loyalty",
    priority: 70,
    trigger: "signal.loyalty_milestone",
    cooldownHours: 24,
    actions: [
      {
        type: "award_points",
        config: { points: 100, reason: "Milestone bonus" },
      },
      {
        type: "send_sms",
        body: "🎉 Congrats {{customer_first_name}}! You just hit {{points}} loyalty points. We added a 100-point bonus to your account. Thanks for being a regular!",
      },
    ],
  },
  {
    id: "cancellation_recovery",
    name: "Cancellation Recovery",
    tagline: "Win back canceled appointments within the hour",
    icon: "↩️",
    category: "recovery",
    priority: 85,
    trigger: "signal.appointment_cancelled",
    cooldownHours: 7 * 24,
    actions: [
      {
        type: "send_email",
        template: "cancellation_recovery",
        subject: "Sorry to see you cancel — here's 10% off when you rebook",
        body: "Hi {{customer_first_name}},\n\nWe noticed you canceled your appointment. Things come up — no problem!\n\nWhen you're ready, here's 10% off to make it easy: {{discount_code}}\n\nRebook anytime: {{booking_url}}\n\n— {{shop_name}}",
        config: { discount_percent: 10, delay_minutes: 60 },
      },
    ],
  },
  {
    id: "birthday_celebration",
    name: "Birthday / Anniversary",
    tagline: "Send a personalized birthday discount",
    icon: "🎂",
    category: "celebration",
    priority: 40,
    trigger: "signal.birthday",
    cooldownHours: 365 * 24, // once per year
    actions: [
      {
        type: "send_email",
        template: "birthday",
        subject: "Happy birthday, {{customer_first_name}} 🎂",
        body: "Happy birthday, {{customer_first_name}}!\n\nAs a small thank-you, here's $25 off your next service — our gift to you.\n\nUse code: {{discount_code}}\nBook: {{booking_url}}\n\nHope your day is wonderful,\n{{shop_name}}",
        config: { discount_amount: 25 },
      },
    ],
  },
  {
    id: "abandoned_booking_recovery",
    name: "Abandoned Booking Recovery",
    tagline: "Win back visitors who started booking but didn't finish",
    icon: "🛒",
    category: "recovery",
    priority: 90,
    trigger: "signal.booking_abandoned",
    cooldownHours: 7 * 24,
    actions: [
      {
        type: "send_email",
        template: "abandoned_booking",
        subject: "Still need that service, {{customer_first_name}}? Here's 10% off",
        body: "Hi {{customer_first_name}},\n\nWe noticed you started booking with us but didn't finish. No worries — life happens.\n\nWhen you're ready, here's 10% off to wrap it up: {{discount_code}}\n\nFinish your booking: {{booking_url}}\n\n— {{shop_name}}",
        config: { discount_percent: 10, delay_minutes: 30 },
      },
      {
        type: "send_sms",
        body: "Hi {{customer_first_name}} — you started booking with {{shop_name}} but didn't finish. Here's 10% off when you complete it: {{booking_url}}",
        config: { delay_minutes: 60 },
      },
    ],
  },
];

export function getAutomationTemplateById(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((t) => t.id === id);
}

/** Variables the editor preview should highlight as substitutable. */
export const TEMPLATE_VARIABLES = [
  { token: "{{customer_name}}", description: "Full customer name" },
  { token: "{{customer_first_name}}", description: "Customer first name" },
  { token: "{{vehicle}}", description: "Vehicle year/make/model" },
  { token: "{{shop_name}}", description: "Your business name" },
  { token: "{{discount_code}}", description: "Generated discount code" },
  { token: "{{discount_amount}}", description: "Dollar amount of discount" },
  { token: "{{discount_percent}}", description: "Percent discount" },
  { token: "{{points}}", description: "Customer loyalty point balance" },
  { token: "{{review_url}}", description: "Public review request URL" },
  { token: "{{booking_url}}", description: "Online booking URL" },
] as const;

/** Sample values for preview rendering (front-end only, never sent). */
export const SAMPLE_PREVIEW_CONTEXT: Record<string, string> = {
  customer_name: "Alex Johnson",
  customer_first_name: "Alex",
  vehicle: "2019 Honda Civic",
  shop_name: "Your Shop",
  discount_code: "SAVE15",
  discount_amount: "25",
  discount_percent: "15",
  points: "750",
  review_url: "https://example.com/review/abc",
  booking_url: "https://example.com/book",
};

/** Resolve {{variables}} in a string against a context (defaults to sample). */
export function renderTemplate(input: string, context: Record<string, string> = SAMPLE_PREVIEW_CONTEXT): string {
  return input.replace(/\{\{\s*([\w_]+)\s*\}\}/g, (_, key: string) => context[key] ?? `{{${key}}}`);
}
