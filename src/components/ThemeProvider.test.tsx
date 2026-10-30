import { act, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "@/hooks/useTheme";

// Theme persistence is account-scoped: the provider resolves the current
// auth session and stores the theme under `${storageKey}:${userId}`.
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { user: { id: "user-1" } } } })),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
    },
  },
}));

const Probe = () => {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme("dark")}>theme:{theme}</button>;
};

describe("ThemeProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() });
    document.documentElement.className = "";
  });

  it("provides the default theme and persists updates", async () => {
    render(<ThemeProvider defaultTheme="light" storageKey="theme:test"><Probe /></ThemeProvider>);

    // Flush the async session resolution that binds the account key.
    await act(async () => {});

    expect(screen.getByRole("button", { name: "theme:light" })).toBeInTheDocument();
    expect(document.documentElement.classList.contains("light")).toBe(true);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button", { name: "theme:dark" })).toBeInTheDocument();
    expect(window.localStorage.getItem("theme:test:user-1")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
