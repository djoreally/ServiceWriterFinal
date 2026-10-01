import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MarketingVideos from "@/legacy-pages/MarketingVideos";

jest.mock("@/components/layout/MarketingSiteChrome", () => ({
  MarketingSiteHeader: () => <div data-testid="marketing-site-header" />,
  MarketingSiteFooter: () => <div data-testid="marketing-site-footer" />,
}));

function renderVideos() {
  return render(
    <MemoryRouter>
      <MarketingVideos />
    </MemoryRouter>,
  );
}

describe("MarketingVideos page (/crm/videos)", () => {
  it("renders the video library content", () => {
    renderVideos();
    expect(screen.getByRole("heading", { name: "Watch it work." })).toBeInTheDocument();
  });

  it("does NOT render the public marketing site header or footer", () => {
    renderVideos();
    expect(screen.queryByTestId("marketing-site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("marketing-site-footer")).not.toBeInTheDocument();
  });

  it("keeps in-app navigation (signup link uses the app router)", () => {
    renderVideos();
    expect(screen.getByRole("link", { name: /Create your account/ })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
