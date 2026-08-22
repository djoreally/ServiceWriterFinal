import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginHub from "./LoginHub";

describe("LoginHub", () => {
  it("renders the Service Writer role chooser", () => {
    render(<MemoryRouter initialEntries={["/login"]}><LoginHub /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Sign in to Service Writer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Business Owner/ })).toHaveAttribute("href", "/login/business");
    expect(screen.queryByText(/Dreamio/i)).not.toBeInTheDocument();
  });
});