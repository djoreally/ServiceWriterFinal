const mockRpc = jest.fn();
const mockInvoke = jest.fn();
jest.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mockRpc, functions: { invoke: mockInvoke } } }));

import { createTeamOsTechnician, manageTeamOsTechnicianAccess } from "../technician-os.command";

describe("Team OS account lifecycle commands", () => {
  beforeEach(() => { mockRpc.mockReset(); mockInvoke.mockReset(); });

  it("creates the roster and invitation before delivering the email", async () => {
    mockRpc.mockResolvedValue({ data: { technician_id: "tech-1", invitation_token: "token-1", email: "alex@example.com", name: "Alex" }, error: null });
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    await createTeamOsTechnician({ name: "Alex", email: "alex@example.com", role: "technician", sendInvite: true });
    expect(mockRpc).toHaveBeenCalledWith("create_team_os_technician_v1", expect.objectContaining({ p_send_invite: true }));
    expect(mockInvoke).toHaveBeenCalledWith("invite-team-member", { body: { email: "alex@example.com", name: "Alex", invitation_token: "token-1" } });
  });

  it("passes reassignment and retention notes to offboarding", async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });
    await manageTeamOsTechnicianAccess("tech-1", "offboard", { reassignTo: "tech-2", notes: "Retain history" });
    expect(mockRpc).toHaveBeenCalledWith("manage_team_os_technician_access_v1", expect.objectContaining({ p_reassign_to: "tech-2", p_notes: "Retain history" }));
  });
});
