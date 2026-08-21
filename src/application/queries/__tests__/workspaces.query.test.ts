import {
  getSelectedWorkspaceId,
  resolveSelectedWorkspace,
  setSelectedWorkspaceId,
} from "@/application/queries/workspaces.selection";
type WorkspaceMembership = {
  workspace_id: string;
  role: string;
  is_active: boolean;
  workspaces: {
    id: string;
    name: string;
    slug: string;
    kind: string;
    timezone: string;
    currency_code: string;
    is_active: boolean;
  } | null;
};

const ACTIVE_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";

function membership(workspaceId: string, isActive = true): WorkspaceMembership {
  return {
    workspace_id: workspaceId,
    role: "manager",
    is_active: isActive,
    workspaces: {
      id: workspaceId,
      name: `Workspace ${workspaceId.slice(-1)}`,
      slug: `workspace-${workspaceId.slice(-1)}`,
      kind: "shop",
      timezone: "America/New_York",
      currency_code: "USD",
      is_active: isActive,
    },
  };
}

describe("workspace selection", () => {
  it("ignores malformed persisted workspace IDs", () => {
    const storage = new Map<string, string>();
    const adapter: Storage = {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
      clear: () => void storage.clear(),
      key: (index) => [...storage.keys()][index] ?? null,
      get length() { return storage.size; },
    };
    adapter.setItem("servicewriter.selected_workspace_id", "not-a-uuid");
    expect(getSelectedWorkspaceId(adapter)).toBeNull();
  });

  it("persists only valid UUID workspace IDs", () => {
    const storage = new Map<string, string>();
    const adapter = { setItem: (key: string, value: string) => storage.set(key, value) } as Storage;
    setSelectedWorkspaceId(ACTIVE_ID, adapter);
    expect(storage.get("servicewriter.selected_workspace_id")).toBe(ACTIVE_ID);
    expect(() => setSelectedWorkspaceId("bad-id", adapter)).toThrow("Invalid workspace id");
  });

  it("falls back to the first active membership and rejects inactive selections", () => {
    const memberships = [membership(ACTIVE_ID), membership(OTHER_ID, false)];
    expect(resolveSelectedWorkspace(memberships, OTHER_ID)?.workspace_id).toBe(ACTIVE_ID);
    expect(resolveSelectedWorkspace(memberships, ACTIVE_ID)?.workspace_id).toBe(ACTIVE_ID);
  });
});
