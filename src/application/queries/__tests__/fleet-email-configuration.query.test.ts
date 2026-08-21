jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from "@/integrations/supabase/client";
import { fetchFleetMailboxConfiguration } from "../fleet-email.query";

describe("fetchFleetMailboxConfiguration", () => {
  it("reads the active workspace connection status from Settings", async () => {
    const status = { workspace_user_id: "owner-1", smtp_configured: true, imap_configured: true };
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: [status], error: null });
    await expect(fetchFleetMailboxConfiguration()).resolves.toEqual(status);
    expect(supabase.rpc).toHaveBeenCalledWith("get_workspace_email_connection_status");
  });

  it("surfaces configuration lookup failures", async () => {
    const error = new Error("settings unavailable");
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error });
    await expect(fetchFleetMailboxConfiguration()).rejects.toBe(error);
  });
});
