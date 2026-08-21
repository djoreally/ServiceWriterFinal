jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchTrackingSettings } from "@/application/queries/tracking-settings.query";

describe("fetchTrackingSettings", () => {
  const mockGetUser = supabase.auth.getUser as jest.Mock;
  const mockFrom = supabase.from as jest.Mock;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it("scopes owner tracking settings to the authenticated user", async () => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      maybeSingle: jest.fn(async () => ({
        data: { enabled: true, ga4_measurement_id: "G-ABC123" },
        error: null,
      })),
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } } });
    mockFrom.mockReturnValue(builder);

    const result = await fetchTrackingSettings();

    expect(result).toEqual({ enabled: true, ga4_measurement_id: "G-ABC123" });
    expect(mockFrom).toHaveBeenCalledWith("tenant_tracking_settings");
    expect(builder.select).toHaveBeenCalledTimes(1);
    expect(builder.eq).toHaveBeenCalledWith("user_id", "owner-1");
    expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
