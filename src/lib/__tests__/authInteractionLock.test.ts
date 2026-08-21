import {
  beginAuthInteraction,
  isAuthInteractionActive,
  resetAuthInteractionLock,
  whenAuthInteractionIdle,
} from "@/lib/authInteractionLock";

describe("authInteractionLock", () => {
  beforeEach(() => resetAuthInteractionLock());

  it("resolves immediately when no credential exchange is in flight", async () => {
    await expect(whenAuthInteractionIdle()).resolves.toBeUndefined();
  });

  it("defers waiters until the last interaction releases", async () => {
    const releaseA = beginAuthInteraction();
    const releaseB = beginAuthInteraction();
    expect(isAuthInteractionActive()).toBe(true);

    let idle = false;
    void whenAuthInteractionIdle().then(() => {
      idle = true;
    });

    releaseA();
    await Promise.resolve();
    expect(idle).toBe(false);

    releaseB();
    await Promise.resolve();
    await Promise.resolve();
    expect(idle).toBe(true);
    expect(isAuthInteractionActive()).toBe(false);
  });

  it("ignores a double release", () => {
    const release = beginAuthInteraction();
    release();
    release();
    expect(isAuthInteractionActive()).toBe(false);
  });
});
