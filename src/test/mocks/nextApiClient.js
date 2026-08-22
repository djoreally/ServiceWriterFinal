const { getFakeBackend } = require("../journeys/fakeBackend");

function appointmentList() {
  const rows = getFakeBackend().tables.appointments || [];
  return Promise.resolve({ data: rows });
}

function workOrderList() {
  const rows = getFakeBackend().tables.fleet_work_orders || [];
  return Promise.resolve({ data: rows });
}

function publicBookingGet(slug, section = "profile", date) {
  const backend = getFakeBackend();
  const profile = backend.tables.business_profiles?.[0];
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
  const handler = backend.rpcHandlers[handlerName];
  if (!handler) return Promise.reject(new Error(`Missing FakeBackend public booking handler: ${section}`));
  return Promise.resolve(handler(argsBySection[section] || {})).then((result) => ({
    data: section === "profile" || section === "settings" ? (result.data?.[0] ?? null) : (result.data || []),
  }));
}

module.exports = {
  nextApi: {
    health: jest.fn(async () => ({ ok: true, version: "test" })),
    publicBooking: { get: jest.fn(publicBookingGet) },
    workspaces: jest.fn(async () => [{ workspaceUserId: "00000000-0000-0000-0000-000000000001", workspaceName: "Apex Mobile Auto Care", role: "admin", landingPath: "/dashboard", isDefault: true }]),
    appointments: {
      list: jest.fn(appointmentList),
      get: jest.fn(async (_workspaceId, id) => ({ data: (getFakeBackend().tables.appointments || []).find((row) => row.id === id) || null })),
      create: jest.fn(async (payload) => ({ data: { id: "appt-created", ...payload } })),
      update: jest.fn(async (id, payload) => ({ data: { id, ...payload } })),
      remove: jest.fn(async () => ({ data: null })),
      cancel: jest.fn(async () => ({ data: null })),
      complete: jest.fn(async () => ({ data: null })),
    },
    workOrders: {
      list: jest.fn(workOrderList),
      get: jest.fn(async (_workspaceId, id) => ({ data: (getFakeBackend().tables.fleet_work_orders || []).find((row) => row.id === id) || null })),
      create: jest.fn(async (payload) => ({ data: { id: "wo-created", ...payload } })),
      update: jest.fn(async (id, payload) => ({ data: { id, ...payload } })),
      advanceChecklist: jest.fn(async () => ({ data: null })),
      updateChecklistItem: jest.fn(async () => ({ data: null })),
    },
    quotes: { convert: jest.fn(async (quoteId, payload) => ({ data: { conversion_id: `conversion-${quoteId}`, quote_id: quoteId, service_record_id: `service-${quoteId}`, status: "converted", ...payload } })) },
    invoices: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
    payments: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn(), action: jest.fn() },
    customers: { list: jest.fn(async () => ({ data: getFakeBackend().tables.customers || [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
    vehicles: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
  },
};
