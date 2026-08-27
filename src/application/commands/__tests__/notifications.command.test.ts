import { createNotification } from "../notifications.command";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { supabase } from "@/integrations/supabase/client";

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { from: jest.fn() },
}));
jest.mock("@/lib/auth/current-user", () => ({ getCurrentAuthUser: jest.fn() }));

const from = supabase.from as jest.Mock;
const authUser = getCurrentAuthUser as jest.Mock;

describe("createNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("upserts a workspace-scoped notification on the user/dedupe conflict key", async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    from.mockReturnValue({ upsert });

    await expect(createNotification({
      type: "new_booking",
      title: "New booking",
      message: "A new booking was created",
      workspaceId: "workspace-1",
      dedupeKey: "booking:appointment-1:new_booking",
      sourceEventId: "appointment-1",
      metadata: { appointment_id: "appointment-1" },
    })).resolves.toBe(true);

    expect(upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      workspace_id: "workspace-1",
      type: "new_booking",
      title: "New booking",
      message: "A new booking was created",
      metadata: { appointment_id: "appointment-1" },
      dedupe_key: "booking:appointment-1:new_booking",
      source_event_id: "appointment-1",
    }, {
      onConflict: "user_id,dedupe_key",
      ignoreDuplicates: true,
    });
  });

  it("does not write when there is no authenticated user", async () => {
    authUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(createNotification({
      type: "email_sent",
      title: "Email sent",
      message: "The email was sent",
    })).resolves.toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});
