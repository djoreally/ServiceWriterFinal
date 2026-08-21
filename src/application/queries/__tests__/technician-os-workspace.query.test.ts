jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: jest.fn() },
    rpc: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { resetCurrentAuthUserCache } from "@/lib/auth/current-user";
import { fetchTeamOsTechnicianSnapshot, getCurrentUser } from "../technician-os.query";

describe("Team OS workspace identity", () => {
  beforeEach(() => {
    resetCurrentAuthUserCache();
  });

  it("uses the active workspace owner for manager-facing technician data", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: "manager-1", email: "manager@example.com" } } });
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: "owner-1", error: null });

    await expect(getCurrentUser()).resolves.toMatchObject({ id: "owner-1", email: "manager@example.com" });
    expect(supabase.rpc).toHaveBeenCalledWith("current_workspace_owner_user_id");
  });

  it("returns null when there is no authenticated user", async () => {
    (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: null } });
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("loads canonical technician metrics for an explicit period", async () => {
    const rows = [{ technician_id: "tech-1", completed_jobs: 3, collected_revenue: 450 }];
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: rows, error: null });

    await expect(fetchTeamOsTechnicianSnapshot("2026-07-01", "2026-07-31")).resolves.toEqual(rows);
    expect(supabase.rpc).toHaveBeenCalledWith("get_team_os_technician_snapshot_v1", {
      p_from: "2026-07-01",
      p_to: "2026-07-31",
    });
  });
});
