import { createNotification } from "../notifications.command";
import { apiClient, ApiClientError } from "@/lib/api-client";

jest.mock("@/lib/api-client", () => ({
  apiClient: { post: jest.fn() },
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

const post = apiClient.post as jest.Mock;

describe("createNotification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("posts a workspace-scoped notification to /v1/notifications", async () => {
    post.mockResolvedValue(undefined);

    await expect(
      createNotification({
        type: "new_booking",
        title: "New booking",
        message: "A new booking was created",
        workspaceId: "workspace-1",
        dedupeKey: "booking:appointment-1:new_booking",
        sourceEventId: "appointment-1",
        metadata: { appointment_id: "appointment-1" },
      }),
    ).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith("/v1/notifications", {
      type: "new_booking",
      title: "New booking",
      message: "A new booking was created",
      metadata: { appointment_id: "appointment-1" },
      workspace_id: "workspace-1",
      dedupe_key: "booking:appointment-1:new_booking",
      source_event_id: "appointment-1",
    });
  });

  it("generates a fallback dedupe key when none is provided", async () => {
    post.mockResolvedValue(undefined);

    await expect(
      createNotification({
        type: "email_sent",
        title: "Email sent",
        message: "The email was sent",
      }),
    ).resolves.toBe(true);

    expect(post).toHaveBeenCalledWith(
      "/v1/notifications",
      expect.objectContaining({
        workspace_id: null,
        source_event_id: null,
        dedupe_key: expect.stringMatching(/^manual:email_sent:/),
      }),
    );
  });

  it("returns false on 401 without throwing", async () => {
    post.mockRejectedValue(new ApiClientError(401, "unauthenticated", "Unauthorized"));

    await expect(
      createNotification({
        type: "email_sent",
        title: "Email sent",
        message: "The email was sent",
      }),
    ).resolves.toBe(false);
  });
});
