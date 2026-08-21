import { fetchRewardsProductionHealth, validateRewardsLaunchSignoff } from "../rewards-production-health.query";
import { supabase } from "@/integrations/supabase/client";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: jest.fn(),
  },
}));

describe("rewards production health queries", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fetches provider production health through the launch health RPC", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: { status: "ok", launch_gate_status: "ready_for_launch_signoff" },
      error: null,
    });

    await expect(fetchRewardsProductionHealth("provider-1")).resolves.toEqual({
      status: "ok",
      launch_gate_status: "ready_for_launch_signoff",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("get_rewards_production_health", { p_provider_id: "provider-1" });
  });

  it("validates launch signoff through the combined launch gate RPC", async () => {
    (supabase.rpc as jest.Mock).mockResolvedValueOnce({
      data: { status: "pass" },
      error: null,
    });

    await expect(validateRewardsLaunchSignoff("provider-1")).resolves.toEqual({ status: "pass" });
    expect(supabase.rpc).toHaveBeenCalledWith("validate_rewards_launch_signoff", { p_provider_id: "provider-1" });
  });
});
