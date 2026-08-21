/**
 * Seed catalog for common motor oil SKUs used in mobile oil change shops.
 * Each seeded item defaults to 24 quarts on hand.
 */

export interface OilSeed {
  name: string;
  category: string;
  sku: string;
  description: string;
}

export const OIL_SEED_ITEMS: OilSeed[] = [
  // Conventional / Synthetic Blend / Full Synthetic standard viscosities
  { name: "0W-16", category: "Oil", sku: "OIL-0W16", description: "0W-16 motor oil" },
  { name: "0W-20", category: "Oil", sku: "OIL-0W20", description: "0W-20 motor oil" },
  { name: "5W-20", category: "Oil", sku: "OIL-5W20", description: "5W-20 motor oil" },
  { name: "5W-30", category: "Oil", sku: "OIL-5W30", description: "5W-30 motor oil" },
  { name: "10W-30", category: "Oil", sku: "OIL-10W30", description: "10W-30 motor oil" },
  { name: "10W-40", category: "Oil", sku: "OIL-10W40", description: "10W-40 motor oil" },

  // High Mileage
  { name: "0W-20 High Mileage", category: "Oil - High Mileage", sku: "OIL-0W20-HM", description: "0W-20 high mileage motor oil" },
  { name: "5W-20 High Mileage", category: "Oil - High Mileage", sku: "OIL-5W20-HM", description: "5W-20 high mileage motor oil" },
  { name: "5W-30 High Mileage", category: "Oil - High Mileage", sku: "OIL-5W30-HM", description: "5W-30 high mileage motor oil" },
  { name: "10W-30 High Mileage", category: "Oil - High Mileage", sku: "OIL-10W30-HM", description: "10W-30 high mileage motor oil" },

  // Euro
  { name: "0W-30 Euro", category: "Oil - Euro", sku: "OIL-0W30-EU", description: "0W-30 European spec motor oil" },
  { name: "0W-40 Euro", category: "Oil - Euro", sku: "OIL-0W40-EU", description: "0W-40 European spec motor oil" },
  { name: "5W-30 Euro", category: "Oil - Euro", sku: "OIL-5W30-EU", description: "5W-30 European spec motor oil" },
  { name: "5W-40 Euro", category: "Oil - Euro", sku: "OIL-5W40-EU", description: "5W-40 European spec motor oil" },

  // Diesel
  { name: "5W-40 Diesel", category: "Oil - Diesel", sku: "OIL-5W40-D", description: "5W-40 diesel motor oil" },
  { name: "15W-40 Diesel", category: "Oil - Diesel", sku: "OIL-15W40-D", description: "15W-40 heavy duty diesel motor oil" },
  { name: "10W-30 Diesel", category: "Oil - Diesel", sku: "OIL-10W30-D", description: "10W-30 diesel motor oil" },
];

export const OIL_SEED_DEFAULT_QUANTITY = 24;
