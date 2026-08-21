import { clearToastHistory, getToastHistory, toast } from "./use-toast";

describe("toast history", () => {
  beforeEach(() => {
    clearToastHistory();
  });

  it("records recent toasts for the history drawer", () => {
    toast({ title: "Saved", description: "Appointment updated" });

    expect(getToastHistory()).toEqual([
      expect.objectContaining({
        title: "Saved",
        description: "Appointment updated",
        createdAt: expect.any(String),
      }),
    ]);
  });

  it("keeps the newest 50 history entries", () => {
    for (let index = 0; index < 55; index += 1) {
      toast({ title: `Toast ${index}` });
    }

    const history = getToastHistory();
    expect(history).toHaveLength(50);
    expect(history[0].title).toBe("Toast 54");
    expect(history[49].title).toBe("Toast 5");
  });
});
