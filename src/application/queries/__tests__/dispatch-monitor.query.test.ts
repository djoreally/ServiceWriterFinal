const mockInvoke = jest.fn();
const mockRpc = jest.fn();
jest.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: mockInvoke }, rpc: mockRpc },
}));

import { invokeDispatchEngine } from "../dispatch-monitor.query";

describe("dispatch monitor contract", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("sends the duration field expected by the dispatch engine", async () => {
    mockInvoke.mockResolvedValue({ data: { success: true, ranked_candidates: [] }, error: null });
    await invokeDispatchEngine({ service_type: "oil_change", scheduled_start: "2026-07-30T10:00", estimated_duration: 75 });
    expect(mockInvoke).toHaveBeenCalledWith("dispatch-engine", {
      body: expect.objectContaining({ estimated_duration_minutes: 75 }),
    });
  });
});
