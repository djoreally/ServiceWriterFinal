import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CRM from "@/legacy-pages/CRM";

jest.mock("@/hooks/useWorkspaceSelection", () => ({
  useWorkspaceSelection: () => ({
    selectedWorkspace: { workspaces: { name: "Apex Mobile Auto Care" } },
    selectedWorkspaceId: "ws-1",
    loading: false,
  }),
}));

jest.mock("@/components/layout/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

const crmMocks = {
  access: jest.fn(async () => ({})),
  profilesList: jest.fn(async () => ({ data: [], meta: { total: 0 } })),
  campaignsList: jest.fn(async () => ({ data: [] })),
  activitiesList: jest.fn(async () => ({ data: [] })),
};

jest.mock("@/lib/nextApiClient", () => ({
  ApiClientError: class ApiClientError extends Error {
    status?: number;
    code?: string;
  },
  nextApi: {
    crm: {
      access: (...args: unknown[]) => crmMocks.access(...args),
      profiles: { list: (...args: unknown[]) => crmMocks.profilesList(...args) },
      campaigns: { list: (...args: unknown[]) => crmMocks.campaignsList(...args) },
      activities: { list: (...args: unknown[]) => crmMocks.activitiesList(...args) },
    },
  },
}));

function renderCRM() {
  return render(
    <MemoryRouter>
      <CRM />
    </MemoryRouter>,
  );
}

describe("CRM page", () => {
  beforeEach(() => {
    crmMocks.access.mockImplementation(async () => ({}));
    crmMocks.profilesList.mockImplementation(async () => ({ data: [], meta: { total: 0 } }));
    crmMocks.campaignsList.mockImplementation(async () => ({ data: [] }));
    crmMocks.activitiesList.mockImplementation(async () => ({ data: [] }));
  });

  it("renders inside the app layout", async () => {
    renderCRM();
    await waitFor(() =>
      expect(screen.getByTestId("app-layout")).toBeInTheDocument(),
    );
    expect(screen.getByText("CRM Dashboard")).toBeInTheDocument();
  });

  it("renders the Growth & marketing hub section", async () => {
    renderCRM();
    const section = await screen.findByRole("region", { name: "Growth and marketing tools" });
    expect(section).toBeInTheDocument();
    expect(
      screen.getByText("Growth & marketing"),
    ).toBeInTheDocument();
  });

  it.each([
    ["Growth Tools", "/crm/growth"],
    ["Newsletter", "/crm/newsletter"],
    ["Marketing Videos", "/crm/videos"],
    ["Retention Engine", "/crm/retention"],
  ])("links %s to %s", async (label, href) => {
    renderCRM();
    const link = await screen.findByRole("link", { name: new RegExp(label) });
    expect(link).toHaveAttribute("href", href);
  });

  it("summarizes CRM profiles, activities, and campaigns", async () => {
    crmMocks.profilesList.mockImplementation(async () => ({
      data: [
        { id: "p1", lifecycle_stage: "active", lead_source: "web", next_action_at: null },
        { id: "p2", lifecycle_stage: "at_risk", lead_source: null, next_action_at: null },
      ],
      meta: { total: 2 },
    }));
    crmMocks.campaignsList.mockImplementation(async () => ({
      data: [{ id: "c1", name: "Spring", channel: "email", approval_state: "draft" }],
    }));
    crmMocks.activitiesList.mockImplementation(async () => ({
      data: [
        {
          id: "a1",
          activity_type: "note_added",
          summary: "Called customer",
          occurred_at: "2026-09-20T10:00:00Z",
        },
      ],
    }));

    renderCRM();

    expect(await screen.findByText("2")).toBeInTheDocument(); // profiles count
    expect(screen.getByText("1 active · 1 at risk")).toBeInTheDocument();
    expect(screen.getByText("1 drafts awaiting review")).toBeInTheDocument();
    expect(screen.getByText("Called customer")).toBeInTheDocument();
  });

  it("shows the access-denied state when the workspace lacks the CRM capability", async () => {
    const { ApiClientError } = jest.requireMock("@/lib/nextApiClient");
    crmMocks.access.mockImplementation(async () => {
      const error = new ApiClientError("forbidden");
      error.status = 403;
      throw error;
    });

    renderCRM();

    expect(
      await screen.findByText("CRM access is not enabled for this workspace"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Growth and marketing tools" }),
    ).not.toBeInTheDocument();
  });
});
