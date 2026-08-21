import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { KeyboardShortcutsProvider, useKeyboardShortcuts } from "./KeyboardShortcutsContext";

const Probe = () => {
  const { registerShortcut, openPalette } = useKeyboardShortcuts();
  const location = useLocation();
  return (
    <div>
      <button onClick={openPalette}>open palette</button>
      <button onClick={() => registerShortcut({ id: "custom", keys: "⌘J", description: "Custom action", run: jest.fn() })}>register</button>
      <span data-testid="path">{location.pathname}</span>
      <input aria-label="editable" />
    </div>
  );
};

describe("KeyboardShortcutsProvider", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });
  it("opens the palette and registers shortcuts", () => {
    render(<MemoryRouter><KeyboardShortcutsProvider><Probe /></KeyboardShortcutsProvider></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "register" }));
    fireEvent.click(screen.getByRole("button", { name: "open palette" }));

    expect(screen.getByText("Custom action")).toBeInTheDocument();
  });

  it("navigates on command shortcuts but ignores editable targets", () => {
    render(<MemoryRouter initialEntries={["/start"]}><KeyboardShortcutsProvider><Probe /></KeyboardShortcutsProvider></MemoryRouter>);

    screen.getByLabelText("editable").focus();
    fireEvent.keyDown(screen.getByLabelText("editable"), { key: "n", metaKey: true });
    expect(screen.getByTestId("path")).toHaveTextContent("/start");

    screen.getByLabelText("editable").blur();
    fireEvent.keyDown(document.body, { key: "n", metaKey: true });
    expect(screen.getByTestId("path")).toHaveTextContent("/appointments");
  });
});
