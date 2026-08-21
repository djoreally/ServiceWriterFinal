import { OperationTimeoutError, withOperationTimeout } from "@/lib/operation-timeout";

describe("withOperationTimeout", () => {
  it("returns the operation result when it resolves before the deadline", async () => {
    await expect(withOperationTimeout(Promise.resolve("ready"), 25, "Timed out")).resolves.toBe("ready");
  });

  it("rejects with the supplied message when an operation remains pending", async () => {
    const never = new Promise<never>(() => undefined);

    await expect(withOperationTimeout(never, 1, "Workspace setup took too long to respond."))
      .rejects
      .toEqual(new OperationTimeoutError("Workspace setup took too long to respond."));
  });
});
