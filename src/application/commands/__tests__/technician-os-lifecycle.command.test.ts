import { jest } from "@jest/globals";

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

import { apiClient } from "@/lib/api-client";
import { createTeamOsTechnician, manageTeamOsTechnicianAccess } from "../technician-os.command";

const post = apiClient.post as jest.Mock;

describe("Team OS account lifecycle commands", () => {
  beforeEach(() => { post.mockReset(); });

  it("creates the roster and invitation before delivering the email", async () => {
    post.mockResolvedValue({ data: { technician_id: "tech-1", invitation_token: "token-1", email: "alex@example.com", name: "Alex", invitation_delivery_error: null } });
    await createTeamOsTechnician({ name: "Alex", email: "alex@example.com", role: "technician", sendInvite: true });
    expect(post).toHaveBeenCalledWith("/v1/tech-os/technicians/create-with-invite", expect.objectContaining({ send_invite: true, email: "alex@example.com" }));
  });

  it("passes reassignment and retention notes to offboarding", async () => {
    post.mockResolvedValue({ data: { success: true } });
    await manageTeamOsTechnicianAccess("tech-1", "offboard", { reassignTo: "tech-2", notes: "Retain history" });
    expect(post).toHaveBeenCalledWith("/v1/tech-os/technicians/tech-1/access", expect.objectContaining({ reassign_to: "tech-2", notes: "Retain history", action: "offboard" }));
  });
});
