const { getFakeBackend } = require("../journeys/fakeBackend");

function appointmentList() {
  const rows = getFakeBackend().tables.appointments || [];
  return Promise.resolve({ data: rows });
}

function workOrderList() {
  const rows = getFakeBackend().tables.fleet_work_orders || [];
  return Promise.resolve({ data: rows });
}

module.exports = {
  nextApi: {
    health: jest.fn(async () => ({ ok: true, version: "test" })),
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
    invoices: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
    payments: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn(), action: jest.fn() },
    customers: { list: jest.fn(async () => ({ data: getFakeBackend().tables.customers || [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
    vehicles: { list: jest.fn(async () => ({ data: [] })), create: jest.fn(), update: jest.fn(), remove: jest.fn() },
  },
};
