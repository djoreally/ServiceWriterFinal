import { act, render, screen } from "@testing-library/react";
import { AuthProvider, type AuthStateSource, type FrontendSession, useAuth } from "./index";
import { SESSION_LIFE_LIMITS, SESSION_LIFE_STORAGE_KEY, type SessionLifeRecord } from "./session-life";

const MIN = 60 * 1000;

const session: FrontendSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  user: { id: "owner-1", email: "owner@example.com" },
};

function Probe() {
  const auth = useAuth();
  return <span data-testid="user">{auth.user?.id ?? "none"}</span>;
}

function createSource() {
  let listener: ((event: string, nextSession: FrontendSession | null) => void) | undefined;
  const signOut = jest.fn().mockResolvedValue({ error: null });
  const source: AuthStateSource = {
    getSession: async () => ({ data: { session } }),
    signOut,
    onAuthStateChange: jest.fn((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    }),
  };
  return { source, signOut, emit: (event: string, value: FrontendSession | null) => listener?.(event, value) };
}

function storedRecord(): SessionLifeRecord | null {
  const raw = window.localStorage.getItem(SESSION_LIFE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as SessionLifeRecord) : null;
}

describe("AuthProvider session life guard", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts both clocks when the persisted session resolves", async () => {
    const { source } = createSource();
    const start = Date.now();
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    await act(async () => {});

    expect(screen.getByTestId("user")).toHaveTextContent("owner-1");
    expect(storedRecord()).toEqual({ userId: "owner-1", loginAt: start, lastActivityAt: start });
  });

  it("a silent token refresh does not move either clock", async () => {
    const { source, emit } = createSource();
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    await act(async () => {});
    const before = storedRecord();

    act(() => { jest.advanceTimersByTime(20 * MIN); });
    act(() => emit("TOKEN_REFRESHED", { ...session, access_token: "access-token-2" }));

    expect(storedRecord()).toEqual(before);
  });

  it("signs out through Supabase once inactivity passes the limit", async () => {
    const { source, signOut } = createSource();
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    await act(async () => {});
    expect(screen.getByTestId("user")).toHaveTextContent("owner-1");

    await act(async () => {
      jest.advanceTimersByTime(SESSION_LIFE_LIMITS.inactivityTimeoutMs + MIN);
    });

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(storedRecord()).toBeNull();
  });

  it("real activity keeps the session alive past the inactivity limit", async () => {
    const { source, signOut } = createSource();
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    await act(async () => {});

    // Twenty minutes pass, the user clicks, twenty more minutes pass: the
    // session is 40 minutes old but was never idle for 30.
    act(() => { jest.advanceTimersByTime(20 * MIN); });
    act(() => { window.dispatchEvent(new Event("pointerdown")); });
    await act(async () => { jest.advanceTimersByTime(20 * MIN); });

    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByTestId("user")).toHaveTextContent("owner-1");
  });
});
