import financialsAsset from "@/assets/product/financials.jpg";
import inventoryEmptyAsset from "@/assets/product/inventory-empty.jpg";
import inventoryItemsAsset from "@/assets/product/inventory-items.jpg";
import inventoryOilUsageAsset from "@/assets/product/inventory-oil-usage.jpg";
import paymentsAsset from "@/assets/product/payments.jpg";
import servicePackagesAsset from "@/assets/product/service-packages.jpg";
import subscriptionsAsset from "@/assets/product/subscriptions.jpg";
import vehicleSpecsAsset from "@/assets/product/vehicle-specs.jpg";

type ImportedImage = string | { src: string };

function assetUrl(asset: ImportedImage): string {
  return typeof asset === "string" ? asset : asset.src;
}

/**
 * Real in-product screenshots used across marketing pages. The registry
 * exposes URL strings so it is compatible with both native img tags and
 * Next.js image processing.
 */
export const productShots = {
  financials: assetUrl(financialsAsset),
  inventoryEmpty: assetUrl(inventoryEmptyAsset),
  inventoryItems: assetUrl(inventoryItemsAsset),
  inventoryOilUsage: assetUrl(inventoryOilUsageAsset),
  payments: assetUrl(paymentsAsset),
  servicePackages: assetUrl(servicePackagesAsset),
  subscriptions: assetUrl(subscriptionsAsset),
  vehicleSpecs: assetUrl(vehicleSpecsAsset),
} as const;

export type ProductShotKey = keyof typeof productShots;
