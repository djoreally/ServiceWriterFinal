import { act, renderHook } from "@testing-library/react";
import { useRealtimeWorkflow } from "./useRealtimeWorkflow";
import {
  createWorkflowChannel,
  removeChannel,
} from "@/application/queries/realtime-workflow.query";

jest.mock("@/application/queries/realtime-workflow.query", () => ({
  createWorkflowChannel: jest.fn(),
  removeChannel: jest.fn(() => Promise.resolve("ok")),
}));

const createMock = createWorkflowChannel as jest.MockedFunction<
  typeof createWorkflowChannel
>;
const removeMock = removeChannel as jest.MockedFunction<typeof removeChannel>;

function fakeChannel(status: string) {
  return {
    subscribe: jest.fn((cb: (s: string) => void) => {
      cb(status);
    }),
  };
}

describe("useRealtimeWorkflow", () => {
  beforeEach(() => {
    createMock.mockReset();
    removeMock.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
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

  it("rejoins after a refused subscribe instead of staying offline forever", async () => {
    // Production evidence (2026-11-08 realtime logs): the service can
    // refuse a join transiently ("Too many database timeouts" while it
    // expands its subscription connection pool). One refusal must not
    // strand the indicator for the whole session.
    createMock
      .mockReturnValueOnce(fakeChannel("CHANNEL_ERROR") as never)
      .mockReturnValueOnce(fakeChannel("SUBSCRIBED") as never);
    const { result } = renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    expect(result.current.isConnected).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(result.current.isConnected).toBe(true);
  });

  it("backs off across repeated refusals", async () => {
    createMock.mockReturnValue(fakeChannel("CHANNEL_ERROR") as never);
    renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    expect(createMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(createMock).toHaveBeenCalledTimes(2);

    // Second rejoin waits for the 4s step, not the 1.5s step.
    await act(async () => {
      jest.advanceTimersByTime(1_500);
    });
    expect(createMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(2_500);
    });
    expect(createMock).toHaveBeenCalledTimes(3);
  });

  it("does not rejoin after unmount", async () => {
    createMock.mockReturnValue(fakeChannel("CHANNEL_ERROR") as never);
    const { unmount } = renderHook(() =>
      useRealtimeWorkflow({ userId: "user-1", enabled: true })
    );
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(120_000);
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
