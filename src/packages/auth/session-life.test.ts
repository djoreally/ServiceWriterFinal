import {
  SESSION_LIFE_LIMITS,
  SESSION_LIFE_STORAGE_KEY,
  SessionLifeGuard,
  evaluateSessionLife,
  readSessionLifeRecord,
  resolveSessionLifeRecord,
  type SessionLifeRecord,
} from "./session-life";

const MIN = 60 * 1000;
const T0 = 1_700_000_000_000;

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: jest.fn((key: string) => data.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => { data.set(key, value); }),
    removeItem: jest.fn((key: string) => { data.delete(key); }),
  };
}

function createGuard(startAt = T0) {
  const storage = createMemoryStorage();
  let now = startAt;
  const onExpire = jest.fn();
  const guard = new SessionLifeGuard({ storage, now: () => now, onExpire });
  return {
    guard,
    storage,
    onExpire,
    setNow: (value: number) => { now = value; },
    advance: (ms: number) => { now += ms; },
  };
}

describe("evaluateSessionLife", () => {
  it("keeps a session that is under both limits", () => {
    const record: SessionLifeRecord = { userId: "u1", loginAt: T0, lastActivityAt: T0 + 10 * MIN };
    expect(evaluateSessionLife(record, T0 + 20 * MIN)).toEqual({ expired: false });
  });

  it("expires on inactivity past the timeout", () => {
    const record: SessionLifeRecord = { userId: "u1", loginAt: T0, lastActivityAt: T0 };
    expect(evaluateSessionLife(record, T0 + SESSION_LIFE_LIMITS.inactivityTimeoutMs)).toEqual({
      expired: true,
      reason: "inactivity",
    });
  });

  it("expires on the absolute cap even when the user was just active", () => {
    const cap = SESSION_LIFE_LIMITS.absoluteMaxAgeMs;
    const record: SessionLifeRecord = { userId: "u1", loginAt: T0, lastActivityAt: T0 + cap - MIN };
    expect(evaluateSessionLife(record, T0 + cap)).toEqual({ expired: true, reason: "absolute-age" });
  });

  it("reports no expiry without a record", () => {
    expect(evaluateSessionLife(null, T0 + 999 * MIN)).toEqual({ expired: false });
  });
});

describe("resolveSessionLifeRecord", () => {
  it("starts fresh clocks when there is no record", () => {
    expect(resolveSessionLifeRecord(null, "u1", T0)).toEqual({
      userId: "u1",
      loginAt: T0,
      lastActivityAt: T0,
    });
  });

  it("keeps the original clocks for the same user (reload / refresh)", () => {
    const existing: SessionLifeRecord = { userId: "u1", loginAt: T0, lastActivityAt: T0 + 5 * MIN };
    expect(resolveSessionLifeRecord(existing, "u1", T0 + 6 * MIN)).toEqual(existing);
  });

  it("starts fresh clocks for a different user", () => {
    const existing: SessionLifeRecord = { userId: "u1", loginAt: T0, lastActivityAt: T0 + 5 * MIN };
    expect(resolveSessionLifeRecord(existing, "u2", T0 + 6 * MIN)).toEqual({
      userId: "u2",
      loginAt: T0 + 6 * MIN,
      lastActivityAt: T0 + 6 * MIN,
    });
  });
});

describe("SessionLifeGuard", () => {
  it("persists the clocks when a session begins", () => {
    const { guard, storage } = createGuard();
    guard.beginSession("u1");
    expect(readSessionLifeRecord(storage)).toEqual({ userId: "u1", loginAt: T0, lastActivityAt: T0 });
    expect(storage.data.has(SESSION_LIFE_STORAGE_KEY)).toBe(true);
  });

  it("keeps the session when checks run under both limits", () => {
    const { guard, onExpire, advance } = createGuard();
    guard.beginSession("u1");
    advance(29 * MIN);
    expect(guard.check()).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("takes the sign-out path once inactivity passes the limit", () => {
    const { guard, storage, onExpire, advance } = createGuard();
    guard.beginSession("u1");
    advance(SESSION_LIFE_LIMITS.inactivityTimeoutMs + MIN);
    expect(guard.check()).toBe(true);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith("inactivity");
    // The stored clocks are wiped so a stale record cannot resurrect it.
    expect(readSessionLifeRecord(storage)).toBeNull();
    // Expiry is a one-shot: later checks do not fire the callback again.
    expect(guard.check()).toBe(false);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("takes the sign-out path at the absolute cap despite constant activity", () => {
    const { guard, onExpire, advance } = createGuard();
    guard.beginSession("u1");
    // Stay active every 10 minutes, well inside the inactivity limit.
    const step = 10 * MIN;
    const cap = SESSION_LIFE_LIMITS.absoluteMaxAgeMs;
    for (let elapsed = step; elapsed < cap; elapsed += step) {
      advance(step);
      guard.recordActivity();
      expect(onExpire).not.toHaveBeenCalled();
    }
    advance(step); // now past the 12h cap, last activity only 10 min ago
    guard.recordActivity();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith("absolute-age");
    // Activity never moved the login clock.
    expect(guard.currentRecord).toBeNull();
  });

  it("activity moves only the activity clock, never the login clock", () => {
    const { guard, advance } = createGuard();
    guard.beginSession("u1");
    advance(20 * MIN);
    guard.recordActivity();
    expect(guard.currentRecord).toEqual({ userId: "u1", loginAt: T0, lastActivityAt: T0 + 20 * MIN });
  });

  it("a silent refresh leaves both clocks and storage untouched", () => {
    const { guard, storage, onExpire, advance } = createGuard();
    guard.beginSession("u1");
    const writesAfterBegin = storage.setItem.mock.calls.length;
    advance(10 * MIN);
    guard.handleSilentRefresh();
    expect(guard.currentRecord).toEqual({ userId: "u1", loginAt: T0, lastActivityAt: T0 });
    expect(readSessionLifeRecord(storage)).toEqual({ userId: "u1", loginAt: T0, lastActivityAt: T0 });
    expect(storage.setItem.mock.calls.length).toBe(writesAfterBegin);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it("a silent refresh after the inactivity limit trips sign-out instead of extending", () => {
    const { guard, onExpire, advance } = createGuard();
    guard.beginSession("u1");
    advance(SESSION_LIFE_LIMITS.inactivityTimeoutMs + MIN);
    guard.handleSilentRefresh();
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledWith("inactivity");
  });

  it("throttles activity writes to storage but tracks activity in memory", () => {
    const { guard, storage, advance } = createGuard();
    guard.beginSession("u1");
    const writesAfterBegin = storage.setItem.mock.calls.length;
    advance(1000);
    guard.recordActivity();
    expect(guard.currentRecord?.lastActivityAt).toBe(T0 + 1000);
    expect(storage.setItem.mock.calls.length).toBe(writesAfterBegin);
    advance(SESSION_LIFE_LIMITS.activityPersistThrottleMs);
    guard.recordActivity();
    expect(storage.setItem.mock.calls.length).toBe(writesAfterBegin + 1);
    expect(readSessionLifeRecord(storage)?.lastActivityAt).toBe(
      T0 + 1000 + SESSION_LIFE_LIMITS.activityPersistThrottleMs,
    );
  });

  it("survives a page reload: a new guard for the same user keeps the login clock", () => {
    const storage = createMemoryStorage();
    let now = T0;
    const first = new SessionLifeGuard({ storage, now: () => now, onExpire: jest.fn() });
    first.beginSession("u1");
    now = T0 + 10 * MIN;
    first.recordActivity();

    const second = new SessionLifeGuard({ storage, now: () => now, onExpire: jest.fn() });
    second.beginSession("u1");
    expect(second.currentRecord).toEqual({ userId: "u1", loginAt: T0, lastActivityAt: T0 + 10 * MIN });
  });

  it("endSession wipes the stored clocks", () => {
    const { guard, storage } = createGuard();
    guard.beginSession("u1");
    guard.endSession();
    expect(guard.currentRecord).toBeNull();
    expect(readSessionLifeRecord(storage)).toBeNull();
  });
});
