// jsdom does not provide the fetch spec globals that `next/server`
// evaluates at import time (`NextRequest extends Request`,
// `NextResponse extends Response`), so importing the module under test
// statically throws "ReferenceError: Request is not defined". Install
// minimal stand-ins first, then load it with a deferred require.
class BillingTestRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  constructor(url: string, init: { method?: string; headers?: HeadersInit } = {}) {
    this.url = url;
    this.method = init.method ?? 'GET';
    this.headers = new Headers(init.headers);
  }
}

class BillingTestResponse {
  readonly status: number;
  readonly headers: Headers;
  private readonly bodyText: string;
  constructor(body = '', init: { status?: number; headers?: HeadersInit } = {}) {
    this.bodyText = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers);
  }
  get body() { return this.bodyText; }
  async json() { return JSON.parse(this.bodyText); }
  async text() { return this.bodyText; }
  static json(data: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
    const headers = new Headers(init.headers);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new BillingTestResponse(JSON.stringify(data), { ...init, headers });
  }
}

const globals = globalThis as unknown as { Request?: unknown; Response?: unknown };
if (!globals.Request) globals.Request = BillingTestRequest;
if (!globals.Response) globals.Response = BillingTestResponse;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { checkoutCatalogKeys } = require('@/server/billing/workspace-billing') as typeof import('@/server/billing/workspace-billing');

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
