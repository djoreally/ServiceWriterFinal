/**
 * One-click starter data for a newly created business workspace.
 *
 * This deliberately uses the same application commands as the normal admin
 * screens so the seed path cannot drift away from the live CRUD contracts.
 * The operation is idempotent: existing catalog items/plans are left alone.
 */
import { fetchServiceTemplates } from "@/application/queries/service-templates.query";
import { fetchCatalogItems } from "@/application/queries/service-catalog.query";
import { adoptServiceTemplates } from "@/application/commands/adopt-service-templates.command";
import { loadTemplatePackages } from "@/application/commands/packages.command";
import { fetchSubscriptionPlans } from "@/application/queries/subscriptions.query";
import { createSubscriptionPlan } from "@/application/commands/subscriptions.command";

export interface StarterBusinessDataResult {
  servicesAdded: number;
  packagesAdded: number;
  subscriptionPlansAdded: number;
}

const normalized = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

const STARTER_SUBSCRIPTION_PLANS = [
  {
    name: "Essentials",
    description: "Starter recurring maintenance membership. Edit the price and included services before publishing.",
    price: 29.99,
    billing_cycle: "monthly" as const,
    features: ["Recurring maintenance membership", "Priority scheduling", "Member pricing"],
    included_services: [] as string[],
    max_services_per_cycle: null,
    is_active: false,
    display_order: 10,
    tier: "essentials",
    badge_label: "Starter",
    highlight: false,
    cta_label: "Subscribe",
  },
  {
    name: "Performance",
    description: "Mid-tier maintenance membership. Edit the price and included services before publishing.",
    price: 59.99,
    billing_cycle: "monthly" as const,
    features: ["Everything in Essentials", "Expanded maintenance benefits", "Priority scheduling"],
    included_services: [] as string[],
    max_services_per_cycle: null,
    is_active: false,
    display_order: 20,
    tier: "performance",
    badge_label: "Popular",
    highlight: true,
    cta_label: "Subscribe",
  },
  {
    name: "Elite VIP",
    description: "Premium recurring maintenance membership. Edit the price and included services before publishing.",
    price: 99.99,
    billing_cycle: "monthly" as const,
    features: ["Everything in Performance", "VIP scheduling", "Premium member benefits"],
    included_services: [] as string[],
    max_services_per_cycle: null,
    is_active: false,
    display_order: 30,
    tier: "elite",
    badge_label: "VIP",
    highlight: false,
    cta_label: "Subscribe",
  },
];

function isCoreStarterService(template: Awaited<ReturnType<typeof fetchServiceTemplates>>[number]): boolean {
  if (template.serviceVertical === "tires" || template.serviceVertical === "detailing") return true;
  if (/oil change/i.test(template.name)) return true;
  return template.id.endsWith("-air-filter") || template.id.endsWith("-wiper-blades");
}

export async function loadStarterBusinessData(): Promise<StarterBusinessDataResult> {
  const [templates, existingCatalog, existingPlans] = await Promise.all([
    fetchServiceTemplates(),
    fetchCatalogItems(),
    fetchSubscriptionPlans(),
  ]);

  const existingTemplateIds = new Set(
    existingCatalog.map((item) => item.template_id).filter((value): value is string => Boolean(value)),
  );
  const existingServiceNames = new Set(existingCatalog.map((item) => normalized(item.name)));

  const missingServices = templates
    .filter(isCoreStarterService)
    .filter((template) => !existingTemplateIds.has(template.id) && !existingServiceNames.has(normalized(template.name)))
    .map((template) => ({ template }));

  const servicesAdded = missingServices.length ? await adoptServiceTemplates(missingServices) : 0;
  const packagesAdded = await loadTemplatePackages();

  const existingPlanNames = new Set(existingPlans.map((plan) => normalized(plan.name)));
  let subscriptionPlansAdded = 0;
  for (const plan of STARTER_SUBSCRIPTION_PLANS) {
    if (existingPlanNames.has(normalized(plan.name))) continue;
    await createSubscriptionPlan(plan);
    subscriptionPlansAdded += 1;
  }

  return { servicesAdded, packagesAdded, subscriptionPlansAdded };
}
