import { checkoutCatalogKeys } from '@/server/billing/workspace-billing';

describe('checkoutCatalogKeys', () => {
  it('keeps Basic free when no paid add-on is selected', () => {
    expect(checkoutCatalogKeys({ planTier: 'basic', interval: 'monthly', paymentsAddonActive: false, additionalTechnicianQuantity: 0 })).toEqual([]);
  });

  it('allows Payments as a separate Basic add-on', () => {
    expect(checkoutCatalogKeys({ planTier: 'basic', interval: 'annual', paymentsAddonActive: true, additionalTechnicianQuantity: 0 })).toEqual([
      { key: 'payments_annual', quantity: 1 },
    ]);
  });

  it('composes Pro from base, technician overage, and optional Payments', () => {
    expect(checkoutCatalogKeys({ planTier: 'pro', interval: 'monthly', paymentsAddonActive: true, additionalTechnicianQuantity: 2 })).toEqual([
      { key: 'pro_monthly', quantity: 1 },
      { key: 'pro_technician_monthly', quantity: 2 },
      { key: 'payments_monthly', quantity: 1 },
    ]);
  });

  it('uses Fleet annual catalog entries without changing quantities', () => {
    expect(checkoutCatalogKeys({ planTier: 'fleet', interval: 'annual', paymentsAddonActive: false, additionalTechnicianQuantity: 3 })).toEqual([
      { key: 'fleet_annual', quantity: 1 },
      { key: 'fleet_technician_annual', quantity: 3 },
    ]);
  });

  it('rejects technician overages on Basic', () => {
    expect(() => checkoutCatalogKeys({ planTier: 'basic', interval: 'monthly', paymentsAddonActive: false, additionalTechnicianQuantity: 1 })).toThrow('Basic does not include technician seats');
  });
});
