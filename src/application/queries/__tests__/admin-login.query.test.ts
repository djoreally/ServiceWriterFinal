jest.mock("@/integrations/supabase/client", () => {
  const maybeSingle = jest.fn();
  const eqRole = jest.fn(() => ({ maybeSingle }));
  const eqUser = jest.fn(() => ({ eq: eqRole }));
  const select = jest.fn(() => ({ eq: eqUser }));

  return {
    supabase: {
      auth: {
        signInWithPassword: jest.fn(),
        signOut: jest.fn(),
      },
      from: jest.fn(() => ({
        select,
      })),
    },
  };
});

import { supabase } from "@/integrations/supabase/client";
import { checkAdminRole, signInAdmin, signOut } from "@/application/queries/admin-login.query";

describe("admin-login.query auth boundaries", () => {
  const mockSignInWithPassword = supabase.auth.signInWithPassword as jest.Mock;
  const mockSignOut = supabase.auth.signOut as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockSignOut.mockReset();
    mockFrom.mockClear();
  });

  it("signInAdmin passes credentials to auth provider", async () => {
    mockSignInWithPassword.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    await signInAdmin("admin@example.com", "secret");

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@example.com",
      password: "secret",
    });
  });

  it("checkAdminRole enforces user and admin role filters", async () => {
    await checkAdminRole("user-123");

    expect(mockFrom).toHaveBeenCalledWith("user_roles");

    const select = mockFrom.mock.results[0].value.select as jest.Mock;
    expect(select).toHaveBeenCalledWith("role");

    const eqUser = select.mock.results[0].value.eq as jest.Mock;
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-123");

    const eqRole = eqUser.mock.results[0].value.eq as jest.Mock;
    expect(eqRole).toHaveBeenCalledWith("role", "admin");

    const maybeSingle = eqRole.mock.results[0].value.maybeSingle as jest.Mock;
    expect(maybeSingle).toHaveBeenCalled();
  });

  it("signOut delegates to auth signOut", async () => {
    mockSignOut.mockResolvedValue({ error: null });

    await signOut();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});
