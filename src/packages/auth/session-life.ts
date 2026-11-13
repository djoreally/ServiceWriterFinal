/**
 * AI TERRITORY: OWNER-GATED — see docs/ai-territory.md.
 * No agent changes without Ty's explicit word.
 */
/**
 * Session life guard — hard limits on how long a signed-in web session may live.
 *
 * Why this exists: Supabase keeps a browser-held refresh token that silently
 * renews the access token in the background. Without an app-level limit, one
 * login can ride for days — a viewer session created on a Tuesday was still
 * being silently refreshed on Thursday morning, with no fresh sign-in in
 * between. The app itself now enforces the limit, regardless of what the
 * browser happens to hold.
 *
 * Two clocks are tracked per signed-in user, persisted in localStorage
 * alongside the Supabase session:
 *
 * - login time — set at sign-in (or the first time a persisted session is
 *   resolved after this guard ships). Never moved by activity or refresh.
 * - last-activity time — moved ONLY by real user activity (pointer, keyboard,
 *   touch, scroll, history navigation), throttled on writes. Silent token
 *   refreshes deliberately do NOT touch either clock; that invisibility is
 *   exactly the behavior being bounded.
 *
 * Tune the limits in SESSION_LIFE_LIMITS below — this is the single place
 * both numbers live.
 */

export const SESSION_LIFE_LIMITS = {
  /** Sign out after this long with no real user activity (30 minutes). */
  inactivityTimeoutMs: 30 * 60 * 1000,
  /** Sign out this long after login, no matter how active the user is (12 hours). */
  absoluteMaxAgeMs: 12 * 60 * 60 * 1000,
  /** How often the running guard re-checks the clocks. */
  checkIntervalMs: 30 * 1000,
  /** Activity writes to storage are throttled to at most one per this window. */
  activityPersistThrottleMs: 15 * 1000,
} as const;

export type SessionLifeLimits = typeof SESSION_LIFE_LIMITS;

export const SESSION_LIFE_STORAGE_KEY = "servicewriter.sessionLife.v1";

export interface SessionLifeRecord {
  userId: string;
  /** Epoch ms of the original sign-in. Immutable once written. */
  loginAt: number;
  /** Epoch ms of the last real user activity. */
  lastActivityAt: number;
}

export type SessionLifeExpiryReason = "inactivity" | "absolute-age";

export type SessionLifeVerdict =
  | { expired: false }
  | { expired: true; reason: SessionLifeExpiryReason };

/**
 * Pure verdict for a stored record at a moment in time. The absolute cap is
 * checked first: a session older than the cap is over even if the user was
 * active a second ago.
 */
export function evaluateSessionLife(
  record: SessionLifeRecord | null,
  now: number,
  limits: SessionLifeLimits = SESSION_LIFE_LIMITS,
): SessionLifeVerdict {
  if (!record) return { expired: false };
  if (now - record.loginAt >= limits.absoluteMaxAgeMs) {
    return { expired: true, reason: "absolute-age" };
  }
  if (now - record.lastActivityAt >= limits.inactivityTimeoutMs) {
    return { expired: true, reason: "inactivity" };
  }
  return { expired: false };
}

/**
 * Resolve the record for a session that has just appeared (sign-in event, or a
 * persisted session resolved on load). An existing record for the SAME user is
 * kept untouched — a page reload or a silent refresh must not restart either
 * clock. A record belonging to a different user (or none) starts fresh clocks.
 */
export function resolveSessionLifeRecord(
  existing: SessionLifeRecord | null,
  userId: string,
  now: number,
): SessionLifeRecord {
  if (existing && existing.userId === userId) {
    // Clamp clock skew: timestamps from the future count as "now" so a skewed
    // device clock cannot extend a session past the limits.
    return {
      userId,
      loginAt: Math.min(existing.loginAt, now),
      lastActivityAt: Math.min(existing.lastActivityAt, now),
    };
  }
  return { userId, loginAt: now, lastActivityAt: now };
}

/** Paths where forcing a trip back to /login would loop or strand the user. */
export function isAuthRoute(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.some((segment) => segment === "login" || segment === "auth");
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readSessionLifeRecord(storage: StorageLike | null = defaultStorage()): SessionLifeRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(SESSION_LIFE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionLifeRecord>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.loginAt !== "number" ||
      typeof parsed.lastActivityAt !== "number"
    ) {
      return null;
    }
    return { userId: parsed.userId, loginAt: parsed.loginAt, lastActivityAt: parsed.lastActivityAt };
  } catch {
    return null;
  }
}

export function writeSessionLifeRecord(
  record: SessionLifeRecord,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_LIFE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage full/blocked: the in-memory record still enforces the limits
    // for this page lifetime.
  }
}

export function clearSessionLifeRecord(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(SESSION_LIFE_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unreachable.
  }
}

export interface SessionLifeGuardOptions {
  storage?: StorageLike | null;
  now?: () => number;
  limits?: SessionLifeLimits;
  /** Called exactly once per session when a limit trips. */
  onExpire: (reason: SessionLifeExpiryReason) => void;
}

/**
 * Stateful controller the AuthProvider drives. DOM wiring (listeners, the
 * check interval) lives in the provider; every clock decision lives here so
 * it can be tested without a browser.
 */
export class SessionLifeGuard {
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly limits: SessionLifeLimits;
  private readonly onExpire: (reason: SessionLifeExpiryReason) => void;
  private record: SessionLifeRecord | null = null;
  private lastPersistAt = 0;
  private expireNotified = false;

  constructor(options: SessionLifeGuardOptions) {
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.now = options.now ?? (() => Date.now());
    this.limits = options.limits ?? SESSION_LIFE_LIMITS;
    this.onExpire = options.onExpire;
  }

  get currentRecord(): SessionLifeRecord | null {
    return this.record;
  }

  /**
   * A session for `userId` is now active (sign-in, or a persisted session
   * resolved on load). Existing clocks for the same user survive; a new user
   * starts fresh clocks.
   */
  beginSession(userId: string): void {
    const now = this.now();
    const stored = readSessionLifeRecord(this.storage);
    const base = this.record && this.record.userId === userId ? this.record : stored;
    this.record = resolveSessionLifeRecord(base, userId, now);
    this.expireNotified = false;
    this.persist(now, true);
  }

  /** The session ended (sign-out from any source): both clocks are wiped. */
  endSession(): void {
    this.record = null;
    this.expireNotified = false;
    clearSessionLifeRecord(this.storage);
  }

  /**
   * Real user activity: moves the last-activity clock only. The login clock
   * is never touched here, so activity cannot extend a session past the
   * absolute cap.
   */
  recordActivity(): void {
    if (!this.record || this.expireNotified) return;
    const now = this.now();
    this.record = { ...this.record, lastActivityAt: now };
    this.persist(now, false);
    this.check();
  }

  /**
   * A silent token refresh happened. By design this is NOT activity: neither
   * clock moves and nothing is written. The guard only re-evaluates, so a
   * refresh arriving after a limit has passed trips the sign-out instead of
   * quietly extending the session. Returns true when the refresh tripped an
   * expiry, so callers can avoid resurrecting the session being ended.
   */
  handleSilentRefresh(): boolean {
    return this.check();
  }

  /**
   * Evaluate the clocks now. On expiry the record is cleared BEFORE the
   * callback runs, and the callback fires at most once per session.
   * Returns true when the session was expired by this check.
   */
  check(): boolean {
    if (!this.record || this.expireNotified) return false;
    const verdict = evaluateSessionLife(this.record, this.now(), this.limits);
    if (!verdict.expired) return false;
    this.expireNotified = true;
    this.record = null;
    clearSessionLifeRecord(this.storage);
    this.onExpire(verdict.reason);
    return true;
  }

  private persist(now: number, force: boolean): void {
    if (!this.record) return;
    if (!force && now - this.lastPersistAt < this.limits.activityPersistThrottleMs) return;
    writeSessionLifeRecord(this.record, this.storage);
    this.lastPersistAt = now;
  }
}
