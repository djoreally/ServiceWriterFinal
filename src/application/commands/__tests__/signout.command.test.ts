jest.mock("@/integrations/supabase/client", () => ({
  AUTH_SUPABASE_PROJECT_ID_RESOLVED: "project-ref",
  supabase: {
    auth: {
      signOut: jest.fn(),
    },
  },
}));

import { signOut } from "@/application/commands/signout.command";
import { supabase } from "@/integrations/supabase/client";

describe("signOut", () => {
  const sdkSignOut = supabase.auth.signOut as jest.Mock;

  beforeEach(() => {
    window.localStorage.clear();
    sdkSignOut.mockReset().mockResolvedValue({ error: null });
  });

  it("clears the persisted browser session before starting best-effort SDK cleanup", async () => {
    window.localStorage.setItem("sb-project-ref-auth-token", "stale-session");
    window.localStorage.setItem("sb-project-ref-auth-token-code-verifier", "stale-verifier");

    await signOut();

    expect(window.localStorage.getItem("sb-project-ref-auth-token")).toBeNull();
    expect(window.localStorage.getItem("sb-project-ref-auth-token-code-verifier")).toBeNull();
    expect(sdkSignOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
