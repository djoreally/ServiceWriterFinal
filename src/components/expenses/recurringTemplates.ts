/**
 * Quick-add templates for common recurring expenses, organized by category.
 * Users can pick a template to pre-fill a new recurring expense dialog.
 */
export interface RecurringTemplate {
  name: string;
  vendor_name: string;
  category_hint: string; // matched (case-insensitive) against category names
  amount: number; // suggested amount
  frequency: "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  notes?: string;
}

export interface RecurringTemplateGroup {
  group: string;
  items: RecurringTemplate[];
}

export const RECURRING_TEMPLATE_GROUPS: RecurringTemplateGroup[] = [
  {
    group: "Vehicle Operations",
    items: [
      { name: "Van Payment", vendor_name: "Auto Loan Lender", category_hint: "Vehicle Payment", amount: 650, frequency: "monthly" },
      { name: "Vehicle Insurance", vendor_name: "Insurance Carrier", category_hint: "Vehicle Insurance", amount: 220, frequency: "monthly" },
      { name: "Registration", vendor_name: "DMV", category_hint: "Vehicle Registration", amount: 120, frequency: "yearly" },
      { name: "Fuel (estimated)", vendor_name: "Gas Stations", category_hint: "Fuel", amount: 400, frequency: "monthly" },
      { name: "Roadside Assistance", vendor_name: "AAA Commercial", category_hint: "Roadside & Emergency", amount: 15, frequency: "monthly" },
    ],
  },
  {
    group: "Business Administration",
    items: [
      { name: "LLC State Filing", vendor_name: "Secretary of State", category_hint: "Business Licenses & Fees", amount: 150, frequency: "yearly" },
      { name: "Bookkeeping", vendor_name: "Bookkeeper", category_hint: "Accounting & Bookkeeping", amount: 200, frequency: "monthly" },
      { name: "CPA Tax Prep", vendor_name: "CPA", category_hint: "Accounting & Bookkeeping", amount: 600, frequency: "yearly" },
      { name: "Bank Fees", vendor_name: "Business Bank", category_hint: "Bank & Processing Fees", amount: 15, frequency: "monthly" },
    ],
  },
  {
    group: "Software & Subscriptions",
    items: [
      { name: "Booking / CRM Software", vendor_name: "MOMS Platform", category_hint: "Software & Subscriptions", amount: 99, frequency: "monthly" },
      { name: "Google Workspace", vendor_name: "Google", category_hint: "Software & Subscriptions", amount: 12, frequency: "monthly" },
      { name: "Canva Pro", vendor_name: "Canva", category_hint: "Software & Subscriptions", amount: 15, frequency: "monthly" },
      { name: "CapCut Pro", vendor_name: "CapCut", category_hint: "Software & Subscriptions", amount: 8, frequency: "monthly" },
      { name: "Repurpose.io", vendor_name: "Repurpose", category_hint: "Software & Subscriptions", amount: 25, frequency: "monthly" },
      { name: "Domain Renewal", vendor_name: "Domain Registrar", category_hint: "Website & Hosting", amount: 18, frequency: "yearly" },
      { name: "Website Hosting", vendor_name: "Hosting Provider", category_hint: "Website & Hosting", amount: 25, frequency: "monthly" },
    ],
  },
  {
    group: "Phone & Communication",
    items: [
      { name: "Business Phone Line", vendor_name: "Cell Carrier", category_hint: "Phone & Communication", amount: 60, frequency: "monthly" },
      { name: "Mobile Hotspot / Data", vendor_name: "Cell Carrier", category_hint: "Phone & Communication", amount: 40, frequency: "monthly" },
      { name: "Customer SMS System", vendor_name: "SMS Provider", category_hint: "Phone & Communication", amount: 20, frequency: "monthly" },
    ],
  },
  {
    group: "Marketing",
    items: [
      { name: "Facebook / Instagram Ads", vendor_name: "Meta", category_hint: "Advertising", amount: 300, frequency: "monthly" },
      { name: "Google Ads", vendor_name: "Google", category_hint: "Advertising", amount: 250, frequency: "monthly" },
      { name: "TikTok Ads", vendor_name: "TikTok", category_hint: "Advertising", amount: 150, frequency: "monthly" },
      { name: "Geofencing / GroundTruth", vendor_name: "GroundTruth", category_hint: "Advertising", amount: 400, frequency: "monthly" },
    ],
  },
  {
    group: "Owner / Operator",
    items: [
      { name: "Health Insurance", vendor_name: "Health Provider", category_hint: "Health Insurance", amount: 450, frequency: "monthly" },
      { name: "Owner Draw", vendor_name: "Owner", category_hint: "Owner Draw", amount: 2000, frequency: "monthly" },
      { name: "Rent", vendor_name: "Landlord", category_hint: "Rent", amount: 1500, frequency: "monthly" },
      { name: "Personal Phone", vendor_name: "Cell Carrier", category_hint: "Phone & Communication", amount: 70, frequency: "monthly" },
    ],
  },
  {
    group: "Waste & Inventory",
    items: [
      { name: "Waste Oil Pickup", vendor_name: "Waste Hauler", category_hint: "Waste Disposal", amount: 75, frequency: "monthly" },
      { name: "Bulk Oil Order", vendor_name: "Oil Supplier", category_hint: "Oil & Lubricants", amount: 600, frequency: "monthly" },
      { name: "Oil Filter Order", vendor_name: "Parts Supplier", category_hint: "Filters", amount: 200, frequency: "monthly" },
      { name: "Shop Supplies", vendor_name: "Parts Supplier", category_hint: "Shop Supplies", amount: 150, frequency: "monthly" },
    ],
  },
];
