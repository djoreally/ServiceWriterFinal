const mockPost = jest.fn();
jest.mock("@/lib/api-client", () => ({
  apiClient: { get: jest.fn(), post: mockPost },
}));

import { invokeDispatchEngine } from "../dispatch-monitor.query";

describe("dispatch monitor contract", () => {
  beforeEach(() => mockPost.mockReset());

  it("sends the duration field expected by the dispatch engine", async () => {
    mockPost.mockResolvedValue({ data: { success: true, ranked_candidates: [] }, error: null });
    await invokeDispatchEngine({ service_type: "oil_change", scheduled_start: "2026-07-30T10:00", estimated_duration: 75 });
    expect(mockPost).toHaveBeenCalledWith("/v1/appointments/edge/dispatch-engine", {
      body: expect.objectContaining({ estimated_duration_minutes: 75 }),
    });
  });
});
