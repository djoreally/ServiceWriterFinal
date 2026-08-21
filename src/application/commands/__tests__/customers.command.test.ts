jest.mock("@/lib/nextApiClient", () => ({
  nextApi: {
    customers: {
      create: jest.fn(async () => ({ data: { id: "11111111-1111-4111-8111-111111111111", first_name: "Ada", last_name: "Lovelace", email: "ada@example.com", phone: null } })),
      update: jest.fn(async () => ({ data: {} })),
      remove: jest.fn(async () => ({ data: {} })),
    },
  },
}));

import { createCustomerAndReturn, deleteCustomer, updateCustomer } from "@/application/commands/customers.command";
import { setSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { nextApi } from "@/lib/nextApiClient";

const workspaceId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  localStorage.clear();
  jest.clearAllMocks();
  setSelectedWorkspaceId(workspaceId);
});

test("creates a customer through the workspace-scoped API", async () => {
  await expect(createCustomerAndReturn({ name: "Ada Lovelace", email: "ada@example.com", phone: null, address: null, notes: null })).resolves.toEqual({
    id: "11111111-1111-4111-8111-111111111111",
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: null,
  });
  expect(nextApi.customers.create).toHaveBeenCalledWith(expect.objectContaining({ workspace_id: workspaceId, first_name: "Ada", last_name: "Lovelace" }));
});

test("updates and soft-deletes through the workspace-scoped API", async () => {
  await updateCustomer(customerId, { name: "Grace Hopper", email: null, phone: "555-0100", address: "1 Main St", notes: "VIP" });
  await deleteCustomer(customerId);
  expect(nextApi.customers.update).toHaveBeenCalledWith(customerId, expect.objectContaining({ workspace_id: workspaceId, first_name: "Grace", last_name: "Hopper" }));
  expect(nextApi.customers.remove).toHaveBeenCalledWith(workspaceId, customerId);
});
