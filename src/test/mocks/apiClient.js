/**
 * Journey-test fake for `@/lib/api-client`.
 *
 * The Phase 2 detangle moved the frontend data layer from direct Supabase
 * reads / `nextApiClient` wrappers onto the typed API client
 * (`apiClient.get("/v1/...")` -> Hono API). The journey harness never
 * followed: `@/lib/api-client` fell through to the empty fetch stub in
 * `src/test/setup.ts`, so every API read resolved `{ data: null }` —
 * workforce identity came back empty (role guards denied every persona)
 * and public-booking/profile reads came back null.
 *
 * This mock plays the Hono API's role for journey suites, backed by the
 * same FakeBackend fixtures/RPC handlers the Supabase-shaped fake uses, and
 * returns the same `{ data: ... }` envelopes the real client unwraps.
 */
const { getFakeBackend } = require("../journeys/fakeBackend");

class ApiClientError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

function rpcData(name, args) {
  const backend = getFakeBackend();
  const handler = backend.rpcHandlers[name];
  if (!handler) return null;
  const result = handler(args || {});
  return result && typeof result === "object" ? result.data : null;
}

function businessProfile() {
  return getFakeBackend().tables.business_profiles?.[0] || null;
}

function workspaceContext() {
  const backend = getFakeBackend();
  const persona = backend.currentPersona;
  const profile = businessProfile();
  return {
    workspaceId: persona?.user?.id || profile?.user_id || "00000000-0000-0000-0000-000000000001",
    businessSettings: profile,
  };
}

function publicBookingSection(slug, section, date) {
  const backend = getFakeBackend();
  const profile = businessProfile();
  const argsBySection = {
    profile: { booking_slug_param: slug },
    catalog: { business_user_id: profile?.user_id },
    packages: { business_user_id: profile?.user_id },
    slots: { business_user_id: profile?.user_id, booking_date: date },
    blocked_dates: { p_business_user_id: profile?.user_id, p_customer_account_id: null },
    settings: { p_business_user_id: profile?.user_id },
  };
  const handlerName = {
    profile: "get_public_booking_profile_v2",
    catalog: "get_public_service_catalog_v2",
    packages: "get_public_service_packages",
    slots: "get_booked_slots",
    blocked_dates: "get_public_blocked_dates",
    settings: "get_public_booking_settings",
  }[section];
  const handler = handlerName ? backend.rpcHandlers[handlerName] : null;
  if (!handler) return null;
  const result = handler(argsBySection[section] || {});
  const data = result && typeof result === "object" ? result.data : null;
  if (section === "profile" || section === "settings") {
    return Array.isArray(data) ? (data[0] ?? null) : data;
  }
  return data || [];
}

function billingSubscription() {
  const profile = businessProfile();
  return {
    workspace: { id: profile?.user_id || "00000000-0000-0000-0000-000000000001" },
    billing: {
      plan_tier: "fleet",
      billing_interval: "monthly",
      payments_addon_active: true,
      additional_technician_quantity: 0,
      subscription_status: "active",
      current_period_end: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      cancel_at_period_end: false,
    },
    entitlements: { entitled_technicians: 10 },
    usage: { technician_count: 2, technicians_remaining: 8 },
  };
}

function serviceCatalogRows() {
  const backend = getFakeBackend();
  return (backend.tables.service_catalog || []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    labor_price: row.price ?? row.labor_price ?? 0,
    estimated_minutes: row.duration_minutes ?? row.estimated_minutes ?? null,
    category: row.category ?? null,
    is_active: row.is_active !== false,
  }));
}

async function handleGet(rawPath, options) {
  // Some callers embed the query string in the path (e.g. /v1/fleet/reports?selected_workspace_id=...)
  const path = String(rawPath).split("?")[0];
  const query = (options && options.query) || {};
  const backend = getFakeBackend();

  if (path === "/v1/workforce-identity") {
    return { data: rpcData("get_workforce_identity_v1") || [] };
  }

  if (path === "/v1/workspace-context") {
    return workspaceContext();
  }

  if (path === "/v1/billing/subscription") {
    return billingSubscription();
  }

  const publicBookingMatch = /^\/v1\/public-booking\/(.+)$/.exec(path);
  if (publicBookingMatch) {
    const slug = decodeURIComponent(publicBookingMatch[1]);
    return { data: publicBookingSection(slug, query.section || "profile", query.date) };
  }

  if (path === "/v1/platform/provider-directory/profile") {
    const rows = rpcData("get_directory_provider_profile", { booking_slug_param: query.slug });
    return { data: Array.isArray(rows) ? (rows[0] ?? null) : rows, error: null };
  }

  if (path === "/v1/platform/provider-directory/services") {
    const rows = (backend.tables.service_catalog || [])
      .filter((row) => row.is_active !== false)
      .map((row) => ({ user_id: row.user_id, name: row.name, default_price: row.price ?? null }));
    return { data: rows, error: null };
  }

  if (path === "/v1/platform/provider-directory/search") {
    const profile = businessProfile();
    const rows = profile
      ? [{
          user_id: profile.user_id,
          business_name: profile.business_name,
          description: profile.description || "",
          booking_slug: profile.business_slug,
          service_address: profile.address || null,
          city: "Philadelphia",
          state: "PA",
          postal_code: "19106",
          logo_url: profile.logo_url || null,
          total_count: 1,
        }]
      : [];
    return { data: rows, error: null };
  }

  if (path === "/v1/platform/inventory/overview") {
    // This endpoint returns the overview object directly (no envelope).
    const items = (backend.tables.inventory_items || []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      sku: row.sku ?? null,
      quantity: row.quantity ?? 0,
      unit: row.unit || "quart",
      unit_cost: row.unit_cost ?? 0,
      sell_price: row.sell_price ?? row.retail_price ?? 0,
      category: row.category ?? null,
      low_stock_threshold: row.low_stock_threshold ?? row.reorder_threshold ?? 0,
    }));
    const vans = (backend.tables.vans || []).map((van) => ({ id: van.id, name: van.name }));
    const vanInventory = (backend.tables.inventory_items || [])
      .filter((row) => row.van_id)
      .map((row) => ({ inventory_item_id: row.id, van_id: row.van_id, quantity: row.quantity ?? 0 }));
    return { items, vans, vanInventory, reservations: [] };
  }

  // Reports endpoints: several return bare payloads (no { data } envelope).
  if (path === "/v1/platform/reports/booking-funnel") {
    return [];
  }

  if (path === "/v1/platform/reports/technicians") {
    return (backend.tables.technicians || []).map((row) => ({
      id: row.id,
      name: row.name || "Technician",
      status: row.status ?? null,
    }));
  }

  if (path === "/v1/platform/reports/customer-analytics-rows") {
    return { customerRows: backend.tables.customers || [], serviceRows: [] };
  }

  if (path === "/v1/platform/reports/earliest-activity") {
    return { apptStartsAt: null, serviceCreatedAt: null };
  }

  if (path === "/v1/platform/reports/canonical-rows") {
    return {
      invoiceRows: [],
      openInvoiceRows: [],
      invoiceYtdRows: [],
      serviceRecordRows: [],
      appointmentRows: [],
      customerRows: [],
      vehicleRows: [],
      invoiceLineRows: [],
    };
  }

  if (path === "/v1/fleet/reports") {
    return {
      data: {
        stats: {
          totalSpend: 0,
          vehicleCount: 0,
          locationCount: 0,
          avgCostPerVehicle: 0,
          openApprovals: 0,
          overdueVehicles: 0,
          poOpenCount: 0,
          invoicesPending: 0,
        },
        topVehicles: [],
      },
    };
  }

  if (path === "/v1/appointments/service-catalog") {
    return { data: serviceCatalogRows().filter((row) => row.is_active) };
  }

  if (path === "/v1/appointments/scheduling-settings") {
    return { settings: null };
  }

  if (path === "/v1/appointments/workspace-context") {
    return { data: { timezone: "America/New_York" } };
  }

  if (path === "/v1/appointments/service-lines") {
    return { data: [] };
  }

  // Unknown reads resolve empty, mirroring the empty-stub philosophy of
  // src/test/setup.ts: pages render their empty states instead of crashing,
  // and journey assertions fail on content, not on transport.
  return { data: [] };
}

async function handleWrite(path, body) {
  const publicBookingMatch = /^\/v1\/public-booking\/(.+)$/.exec(path);
  if (publicBookingMatch) {
    // Booking submissions go through the same RPC contract the fake exposes.
    const backend = getFakeBackend();
    if (backend.rpcHandlers.public_booking_book_appointment) {
      const result = await backend.rpc("public_booking_book_appointment", body || {});
      return { data: result.data ?? null };
    }
  }
  return { data: null };
}

async function apiRequest(path, init = {}) {
  const method = (init.method || "GET").toUpperCase();
  if (method === "GET") return handleGet(path, init);
  return handleWrite(path, init.body);
}

const apiClient = {
  get: (path, options = {}) => handleGet(path, options),
  post: (path, body) => handleWrite(path, body),
  put: (path, body) => handleWrite(path, body),
  patch: (path, body) => handleWrite(path, body),
  delete: () => Promise.resolve({ data: null }),
};

module.exports = {
  apiClient,
  apiRequest,
  ApiClientError,
  DEFAULT_REQUEST_TIMEOUT_MS,
};
