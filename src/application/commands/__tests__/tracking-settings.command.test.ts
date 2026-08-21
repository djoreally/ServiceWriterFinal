jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { saveTrackingEnabled } from "@/application/commands/tracking-settings.command";

describe("saveTrackingEnabled", () => {
  const mockGetUser = supabase.auth.getUser as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("persists only the master tracking switch for the authenticated user", async () => {
    const builder = {
      upsert: jest.fn(async () => ({ error: null })),
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    mockFrom.mockReturnValue(builder);

    await saveTrackingEnabled(true);

    expect(mockFrom).toHaveBeenCalledWith("tenant_tracking_settings");
    expect(builder.upsert).toHaveBeenCalledWith(
      { user_id: "owner-1", enabled: true },
      { onConflict: "user_id" },
    );
  });
});
