export interface TireServicePricingRule {
  serviceCatalogId: string;
  baseInstallationPrice: number;
  mountBalancePrice: number;
  tpmsServicePrice: number;
  disposalPrice: number;
  alignmentPrice: number;
  minimumQuantity: number;
  maximumQuantity: number;
  requiresInventorySelection: boolean;
  requiresFitmentLookup: boolean;
  allowsManualFitment: boolean;
  allowsStaggeredFitment: boolean;
  durationMinutesPerTire: number;
}

export function defaultTirePricingRule(serviceCatalogId: string): TireServicePricingRule {
  return {
    serviceCatalogId,
    baseInstallationPrice: 0,
    mountBalancePrice: 0,
    tpmsServicePrice: 0,
    disposalPrice: 0,
    alignmentPrice: 0,
    minimumQuantity: 1,
    maximumQuantity: 4,
    requiresInventorySelection: false,
    requiresFitmentLookup: true,
    allowsManualFitment: true,
    allowsStaggeredFitment: false,
    durationMinutesPerTire: 30,
  };
}

export function calculateTireServiceTotal(rule: TireServicePricingRule, quantity: number, options: { mountBalance?: boolean; tpms?: boolean; disposal?: boolean; alignment?: boolean } = {}) {
  return rule.baseInstallationPrice * quantity
    + (options.mountBalance ? rule.mountBalancePrice * quantity : 0)
    + (options.tpms ? rule.tpmsServicePrice * quantity : 0)
    + (options.disposal ? rule.disposalPrice * quantity : 0)
    + (options.alignment ? rule.alignmentPrice : 0);
}
