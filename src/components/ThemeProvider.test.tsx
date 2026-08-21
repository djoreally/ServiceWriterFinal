import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "@/hooks/useTheme";

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

  it("provides the default theme and persists updates", () => {
    render(<ThemeProvider defaultTheme="light" storageKey="theme:test"><Probe /></ThemeProvider>);

    expect(screen.getByRole("button", { name: "theme:light" })).toBeInTheDocument();
    expect(document.documentElement.classList.contains("light")).toBe(true);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button", { name: "theme:dark" })).toBeInTheDocument();
    expect(window.localStorage.getItem("theme:test")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });
});
