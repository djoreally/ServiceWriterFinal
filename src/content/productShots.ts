import financials from "@/assets/product/financials.jpg";
import inventoryEmpty from "@/assets/product/inventory-empty.jpg";
import inventoryItems from "@/assets/product/inventory-items.jpg";
import inventoryOilUsage from "@/assets/product/inventory-oil-usage.jpg";
import payments from "@/assets/product/payments.jpg";
import servicePackages from "@/assets/product/service-packages.jpg";
import subscriptions from "@/assets/product/subscriptions.jpg";
import vehicleSpecs from "@/assets/product/vehicle-specs.jpg";

/**
 * Real in-product screenshots used across marketing pages
 * (homepage feature grid + feature detail pages).
 */
export const productShots = {
  financials,
  inventoryEmpty,
  inventoryItems,
  inventoryOilUsage,
  payments,
  servicePackages,
  subscriptions,
  vehicleSpecs,
} as const;

export type ProductShotKey = keyof typeof productShots;
