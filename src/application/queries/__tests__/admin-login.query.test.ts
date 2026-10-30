jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock("@/lib/api-client", () => ({
  apiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiClientError: class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { apiClient } from "@/lib/api-client";
import { checkAdminRole, signInAdmin, signOut } from "@/application/queries/admin-login.query";

describe("admin-login.query auth boundaries", () => {
  const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
  const mockSignOut = supabase.auth.signOut as jest.Mock;
  const mockGet = apiClient.get as jest.Mock;

  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset();
    mockGet.mockReset();
  });

  it("signInAdmin passes credentials to auth provider", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await signInAdmin("admin@example.com", "secret");

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "secret",
    });
  });

  it("checkAdminRole resolves the role through the admin role endpoint", async () => {
    // The user + admin role filters now run server-side: the endpoint
    // (src/server/hono/routes/platform.ts) queries user_roles with
    // .eq("user_id", userId).eq("role", "admin"). This pins the client
    // half: the check is scoped to the exact user id and surfaces the
    // server's role row.
    mockGet.mockResolvedValue({ data: { role: "admin" } });

    await expect(checkAdminRole("user-123")).resolves.toEqual({
      data: { role: "admin" },
      error: null,
    });

    expect(mockGet).toHaveBeenCalledWith("/v1/platform/admin/users/user-123/role");
  });

  it("signOut delegates to auth signOut", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
