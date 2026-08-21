import { OperationTimeoutError, withOperationTimeout } from "@/lib/operation-timeout";

describe("withOperationTimeout", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns the operation result when it settles before the deadline", async () => {
    await expect(
      withOperationTimeout(Promise.resolve("ready"), 1_000, "should not time out"),
    ).resolves.toBe("ready");
  });

  it("rejects a permanently pending operation at the configured deadline", async () => {
    jest.useFakeTimers();
    const pending = new Promise<never>(() => {});
    const result = withOperationTimeout(pending, 3_000, "Initial session check timed out");

    jest.advanceTimersByTime(3_000);

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<OperationTimeoutError>>({
        name: "OperationTimeoutError",
        message: "Initial session check timed out",
      }),
    );
  });
});
