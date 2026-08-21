import { act, renderHook } from "@testing-library/react";
import { useFormAutoSave } from "./useFormAutoSave";

describe("useFormAutoSave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("saves, restores, labels, and clears a draft", () => {
    const { result } = renderHook(() => useFormAutoSave({ key: "draft:test", value: { name: "A" }, delayMs: 10 }));

    act(() => {
      jest.advanceTimersByTime(10);
    });

    expect(result.current.restore()).toEqual({ name: "A" });
    expect(result.current.label).toMatch(/Auto-saved at/);

    act(() => {
      result.current.clear();
    });

    expect(result.current.restore()).toBeNull();
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("does not write when disabled", () => {
    const { result } = renderHook(() => useFormAutoSave({ key: "draft:disabled", value: { name: "A" }, enabled: false, delayMs: 10 }));

    act(() => {
      jest.advanceTimersByTime(10);
    });

    expect(result.current.restore()).toBeNull();
  });
});
