import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Newsletter from "@/legacy-pages/Newsletter";

jest.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

jest.mock("@/components/layout/MarketingSiteChrome", () => ({
  MarketingSiteHeader: () => <div data-testid="marketing-site-header" />,
  MarketingSiteFooter: () => <div data-testid="marketing-site-footer" />,
}));

jest.mock("@/components/marketing/NewsletterSequence", () => ({
  NewsletterSequence: () => <div data-testid="newsletter-sequence" />,
}));

function renderNewsletter() {
  return render(
    <MemoryRouter>
      <Newsletter />
    </MemoryRouter>,
  );
}

describe("Newsletter page (/crm/newsletter)", () => {
  it("renders inside the authenticated app layout", () => {
    renderNewsletter();
    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Newsletter Sequences" })).toBeInTheDocument();
    expect(screen.getByTestId("newsletter-sequence")).toBeInTheDocument();
  });

  it("does NOT render the public marketing site header or footer", () => {
    renderNewsletter();
    expect(screen.queryByTestId("marketing-site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("marketing-site-footer")).not.toBeInTheDocument();
  });
});
