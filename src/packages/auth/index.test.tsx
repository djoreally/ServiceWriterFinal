import { act, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, type AuthStateSource, type FrontendSession, useAuth } from "./index";

const session: FrontendSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  user: { id: "owner-1", email: "owner@example.com" },
};

function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(auth.loading)}</span>
      <span data-testid="user">{auth.user?.id ?? "none"}</span>
      <button onClick={() => void auth.signOut()}>sign out</button>
    </div>
  );
}

function createSource(getSession: AuthStateSource["getSession"]) {
  let listener: ((event: string, nextSession: FrontendSession | null) => void) | undefined;
  const unsubscribe = jest.fn();
  const signOut = jest.fn().mockResolvedValue({ error: null });
  const source: AuthStateSource = {
    getSession,
    signOut,
    onAuthStateChange: jest.fn((callback) => {
      listener = callback;
      return { data: { subscription: { unsubscribe } } };
    }),
  };
  return { source, signOut, unsubscribe, emit: (event: string, value: FrontendSession | null) => listener?.(event, value) };
}

describe("AuthProvider", () => {
  it("keeps protected routing in loading state until the persisted session is restored", async () => {
    let resolveSession!: (value: { data: { session: FrontendSession | null } }) => void;
    const pending = new Promise<{ data: { session: FrontendSession | null } }>((resolve) => { resolveSession = resolve; });
    const { source } = createSource(() => pending);

    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(screen.getByTestId("user")).toHaveTextContent("none");

    await act(async () => resolveSession({ data: { session } }));
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("user")).toHaveTextContent("owner-1");
  });

  it("does not overwrite a newer SIGNED_IN event with a stale bootstrap snapshot", async () => {
    let resolveSession!: (value: { data: { session: FrontendSession | null } }) => void;
    const pending = new Promise<{ data: { session: FrontendSession | null } }>((resolve) => { resolveSession = resolve; });
    const { source, emit } = createSource(() => pending);
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);

    act(() => emit("SIGNED_IN", session));
    await act(async () => resolveSession({ data: { session: null } }));

    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("owner-1"));
  });

  it("signs out through Supabase so browser persistence is cleared", async () => {
    const { source, signOut } = createSource(async () => ({ data: { session } }));
    render(<AuthProvider authStateSource={source}><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("owner-1"));

    screen.getByRole("button", { name: "sign out" }).click();
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("user")).toHaveTextContent("none"));
  });
});
