import { renderHook } from "@testing-library/react";
import { useRealtimeWorkflow } from "./useRealtimeWorkflow";
import { createWorkflowChannel } from "@/application/queries/realtime-workflow.query";

jest.mock("@/application/queries/realtime-workflow.query", () => ({
  createWorkflowChannel: jest.fn(),
  removeChannel: jest.fn(),
}));

const createMock = createWorkflowChannel as jest.MockedFunction<
  typeof createWorkflowChannel
>;

function fakeChannel(status: string) {
  return {
    subscribe: jest.fn((cb: (s: string) => void) => {
      cb(status);
    }),
  };
}

describe("useRealtimeWorkflow", () => {
  beforeEach(() => {
    createMock.mockClear();
  });

  it("subscribes only to tables that exist and are published for realtime", () => {
    // Regression guard for the permanent false "Offline" state: the old
    // bindings named "services" and "service_timeline", which do not exist
    // in production, and appointments was missing from the supabase_realtime
    // publication — the channel could never reach SUBSCRIBED.
    createMock.mockReturnValue(fakeChannel("SUBSCRIBED") as never);
    renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    expect(createMock).toHaveBeenCalledTimes(1);
    const tables = createMock.mock.calls[0][1];
    expect(tables).toEqual([
      { table: "appointments", type: "appointment" },
      { table: "service_records", type: "service" },
    ]);
  });

  it("reports connected once the channel subscribes", () => {
    createMock.mockReturnValue(fakeChannel("SUBSCRIBED") as never);
    const { result } = renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    expect(result.current.isConnected).toBe(true);
  });

  it("reports not connected when the channel errors", () => {
    createMock.mockReturnValue(fakeChannel("CHANNEL_ERROR") as never);
    const { result } = renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    expect(result.current.isConnected).toBe(false);
  });
});
