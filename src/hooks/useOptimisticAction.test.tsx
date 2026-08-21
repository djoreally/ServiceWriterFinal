import { act, renderHook } from "@testing-library/react";
import { useOptimisticAction } from "./useOptimisticAction";

describe("useOptimisticAction", () => {
  it("applies optimistic state and returns the action result on success", async () => {
    const apply = jest.fn();
    const rollback = jest.fn();
    const onSuccess = jest.fn();
    const run = jest.fn().mockResolvedValue({ id: "saved" });

    const { result } = renderHook(() => useOptimisticAction({ apply, rollback, run, onSuccess }));

    let actionResult: Awaited<ReturnType<typeof result.current.executeWithResult>> | undefined;
    await act(async () => {
      actionResult = await result.current.executeWithResult("draft");
    });

    expect(apply).toHaveBeenCalledWith("draft");
    expect(run).toHaveBeenCalledWith("draft");
    expect(rollback).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith("draft", { id: "saved" });
    expect(actionResult).toEqual({ ok: true, result: { id: "saved" } });
    expect(result.current.isPending).toBe(false);
  });

  it("rolls back and reports failure when the action rejects", async () => {
    const error = new Error("nope");
    const apply = jest.fn();
    const rollback = jest.fn();
    const onError = jest.fn();
    const run = jest.fn().mockRejectedValue(error);

    const { result } = renderHook(() => useOptimisticAction({ apply, rollback, run, onError }));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.execute("draft");
    });

    expect(ok).toBe(false);
    expect(apply).toHaveBeenCalledWith("draft");
    expect(rollback).toHaveBeenCalledWith("draft");
    expect(onError).toHaveBeenCalledWith(error, "draft");
    expect(result.current.pendingCount).toBe(0);
  });
});
