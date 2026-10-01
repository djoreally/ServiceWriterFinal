import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Marketing from "@/legacy-pages/Marketing";

jest.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

jest.mock("@/components/layout/MarketingSiteChrome", () => ({
  MarketingSiteHeader: () => <div data-testid="marketing-site-header" />,
  MarketingSiteFooter: () => <div data-testid="marketing-site-footer" />,
}));

// Heavy marketing children are stubbed: this suite covers the page shell —
// AppLayout chrome and the absence of the public marketing site chrome.
jest.mock("@/components/assets/AssetsPage", () => ({
  AssetsPage: () => <div data-testid="assets-page" />,
}));
jest.mock("@/components/assets/AssetsErrorBoundary", () => ({
  AssetsErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock("@/components/assets/AssetsLoading", () => ({
  AssetsLoading: () => <div data-testid="assets-loading" />,
}));
jest.mock("@/components/marketing/CampaignManager", () => ({
  CampaignManager: () => <div data-testid="campaign-manager" />,
}));
jest.mock("@/components/marketing/ReviewDashboard", () => ({
  ReviewDashboard: () => <div data-testid="review-dashboard" />,
}));
jest.mock("@/components/marketing/TestimonialManager", () => ({
  TestimonialManager: () => <div data-testid="testimonial-manager" />,
}));
jest.mock("@/components/marketing/MarketingAnalytics", () => ({
  MarketingAnalytics: () => <div data-testid="marketing-analytics" />,
}));
jest.mock("@/components/marketing/EmailTesting", () => ({
  EmailTesting: () => <div data-testid="email-testing" />,
}));
jest.mock("@/components/marketing/CustomerSegmentation", () => ({
  CustomerSegmentation: () => <div data-testid="customer-segmentation" />,
}));
jest.mock("@/components/marketing/DeclinedServicesTracker", () => ({
  DeclinedServicesTracker: () => <div data-testid="declined-services-tracker" />,
}));
jest.mock("@/components/marketing/FollowUpAutomation", () => ({
  FollowUpAutomation: () => <div data-testid="follow-up-automation" />,
}));
jest.mock("@/components/marketing/GoogleMyBusinessPanel", () => ({
  GoogleMyBusinessPanel: () => <div data-testid="google-my-business-panel" />,
}));

function renderMarketing() {
  return render(
    <MemoryRouter>
      <Marketing />
    </MemoryRouter>,
  );
}

describe("Marketing page (/crm/growth)", () => {
  it("renders inside the authenticated app layout", () => {
    renderMarketing();
    expect(screen.getByTestId("app-layout")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Growth Tools" })).toBeInTheDocument();
  });

  it("does NOT render the public marketing site header or footer", () => {
    renderMarketing();
    expect(screen.queryByTestId("marketing-site-header")).not.toBeInTheDocument();
    expect(screen.queryByTestId("marketing-site-footer")).not.toBeInTheDocument();
  });

  it("exposes the growth tool tabs", () => {
    renderMarketing();
    expect(screen.getByText("Customer Segments")).toBeInTheDocument();
    expect(screen.getByText("Campaigns")).toBeInTheDocument();
  });
});
