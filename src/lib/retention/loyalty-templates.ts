/**
 * Preconfigured loyalty program templates.
 * Each template = one program + N rewards, ready to seed in one click.
 */

export type LoyaltyRewardType =
  | "credit"
  | "free_service"
  | "discount_percent"
  | "discount_fixed"
  | "priority_booking";

export interface LoyaltyTemplateReward {
  name: string;
  description: string;
  pointsRequired: number;
  rewardType: LoyaltyRewardType;
  /** Numeric value (percent for discount_percent, dollars for credit/discount_fixed). null for non-numeric rewards. */
  configValue: number | null;
}

export interface LoyaltyTemplate {
  id: string;
  name: string;
  tagline: string;
  icon: string;
  scope: "per_vehicle" | "per_customer" | "global";
  pointsPerDollar: number;
  pointsPerVisit: number;
  rewards: LoyaltyTemplateReward[];
}

export const LOYALTY_TEMPLATES: LoyaltyTemplate[] = [
  {
    id: "oil_change_loyalty",
    name: "Oil Change Loyalty",
    tagline: "Reward repeat oil changes per vehicle",
    icon: "🛢️",
    scope: "per_vehicle",
    pointsPerDollar: 1,
    pointsPerVisit: 10,
    rewards: [
      { name: "10% Off Next Service", description: "Take 10% off any service", pointsRequired: 100, rewardType: "discount_percent", configValue: 10 },
      { name: "Free Fluid Top-off", description: "Complimentary fluid top-off with next visit", pointsRequired: 250, rewardType: "free_service", configValue: null },
      { name: "Free Oil Change", description: "Standard oil change on the house", pointsRequired: 500, rewardType: "free_service", configValue: null },
      { name: "$50 Service Credit", description: "$50 credit on any service", pointsRequired: 1000, rewardType: "credit", configValue: 50 },
    ],
  },
  {
    id: "service_rewards",
    name: "Service Rewards",
    tagline: "Balanced everyday loyalty for any shop",
    icon: "🔧",
    scope: "per_customer",
    pointsPerDollar: 2,
    pointsPerVisit: 25,
    rewards: [
      { name: "$10 Credit", description: "$10 off any service", pointsRequired: 200, rewardType: "credit", configValue: 10 },
      { name: "15% Off Service", description: "Take 15% off any service", pointsRequired: 500, rewardType: "discount_percent", configValue: 15 },
      { name: "Free Multi-point Inspection", description: "Complimentary inspection", pointsRequired: 1000, rewardType: "free_service", configValue: null },
      { name: "Priority Booking", description: "Skip the line — priority scheduling", pointsRequired: 2000, rewardType: "priority_booking", configValue: null },
      { name: "$100 Credit", description: "$100 off any service", pointsRequired: 3000, rewardType: "credit", configValue: 100 },
    ],
  },
  {
    id: "vip_tier",
    name: "VIP Tier",
    tagline: "Premium rewards for top customers",
    icon: "🏆",
    scope: "per_customer",
    pointsPerDollar: 3,
    pointsPerVisit: 50,
    rewards: [
      { name: "20% Off Service", description: "Take 20% off any service", pointsRequired: 500, rewardType: "discount_percent", configValue: 20 },
      { name: "Free Standard Service", description: "Any standard service free", pointsRequired: 1000, rewardType: "free_service", configValue: null },
      { name: "$100 Credit", description: "$100 service credit", pointsRequired: 2000, rewardType: "credit", configValue: 100 },
      { name: "Free Brake Inspection", description: "Complete brake inspection", pointsRequired: 3000, rewardType: "free_service", configValue: null },
      { name: "$250 Credit", description: "$250 service credit", pointsRequired: 5000, rewardType: "credit", configValue: 250 },
      { name: "Free Major Service", description: "Major service package on the house", pointsRequired: 10000, rewardType: "free_service", configValue: null },
    ],
  },
  {
    id: "fleet_volume",
    name: "Fleet Volume",
    tagline: "High-value rewards for fleet customers",
    icon: "🚗",
    scope: "per_customer",
    pointsPerDollar: 1,
    pointsPerVisit: 0,
    rewards: [
      { name: "$250 Fleet Credit", description: "$250 toward any fleet service", pointsRequired: 5000, rewardType: "credit", configValue: 250 },
      { name: "Free Fleet Inspection", description: "Comprehensive fleet inspection", pointsRequired: 10000, rewardType: "free_service", configValue: null },
      { name: "$1500 Fleet Credit", description: "$1500 toward fleet maintenance", pointsRequired: 25000, rewardType: "credit", configValue: 1500 },
    ],
  },
];

export function getTemplateById(id: string): LoyaltyTemplate | undefined {
  return LOYALTY_TEMPLATES.find((t) => t.id === id);
}
