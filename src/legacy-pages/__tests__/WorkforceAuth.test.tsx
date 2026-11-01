/**
 * WorkforceAuth — self-serve signup (P0-1) and the no-workspace door.
 *
 * Covers: the signup form's business-name + Terms/Privacy gate, the
 * provision-on-signup flow when a session already exists, the
 * confirmation-pending path (provisioning deferred to first sign-in),
 * and the create-workspace door offered to an authenticated business
 * account with zero workspace memberships — while invited-role doors
 * (technician) keep the role-mismatch guidance.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@packages/auth", () => ({ useAuth: jest.fn() }));
jest.mock("@/application/commands/auth.command", () => ({
  signInWithPassword: jest.fn(),
  signUpWithEmail: jest.fn(),
}));
jest.mock("@/application/commands/workspace-provisioning.command", () => ({
  provisionOwnerWorkspace: jest.fn(),
}));
jest.mock("@/application/queries/workforce-identity.query", () => ({
  fetchWorkforceIdentity: jest.fn(),
  selectActiveWorkspace: jest.fn(),
}));
jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      getUser: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));
jest.mock("@/components/ui/sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

import { useAuth } from "@packages/auth";
import { signUpWithEmail } from "@/application/commands/auth.command";
import { provisionOwnerWorkspace } from "@/application/commands/workspace-provisioning.command";
import { fetchWorkforceIdentity, selectActiveWorkspace } from "@/application/queries/workforce-identity.query";
import { supabase } from "@/integrations/supabase/client";
import { WorkforceAuth } from "@/legacy-pages/WorkforceAuth";

const useAuthMock = useAuth as jest.Mock;
const signUpMock = signUpWithEmail as jest.Mock;
const provisionMock = provisionOwnerWorkspace as jest.Mock;
const fetchIdentityMock = fetchWorkforceIdentity as jest.Mock;
const selectWorkspaceMock = selectActiveWorkspace as jest.Mock;
const getSessionMock = supabase.auth.getSession as jest.Mock;
const getUserMock = supabase.auth.getUser as jest.Mock;

const ownerMembership = {
  workspaceUserId: "ws-1",
  workspaceName: "MOMS Mobile Oil Change",
  role: "owner" as const,
  landingPath: "/dashboard",
  isDefault: true,
};

function renderSignup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/signup"]}>
        <Routes>
          <Route path="/signup" element={<WorkforceAuth intent="signup" />} />
          <Route path="/login/business" element={<div>BUSINESS LOGIN</div>} />
          <Route path="/settings" element={<div>SETTINGS SETUP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderBusinessLogin() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login/business"]}>
        <Routes>
          <Route path="/login/business" element={<WorkforceAuth intent="login" variant="business" />} />
          <Route path="/login/technician" element={<WorkforceAuth intent="login" variant="technician" />} />
          <Route path="/settings" element={<div>SETTINGS SETUP</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function fillSignupForm(container: HTMLElement) {
  fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "MOMS Mobile Oil Change" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "owner@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret1" } });
  fireEvent.click(screen.getByRole("checkbox"));
  const form = container.querySelector("form");
  if (!form) throw new Error("signup form not found");
  return form;
}

describe("WorkforceAuth signup (self-serve)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({ session: null, loading: false });
    signUpMock.mockResolvedValue({});
    provisionMock.mockResolvedValue({ workspaceId: "ws-1", slug: "moms-mobile-oil-change", created: true });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("gates account creation on a business name and Terms/Privacy acceptance", () => {
    renderSignup();
    const createButton = screen.getByRole("button", { name: "Create account" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "MOMS Mobile Oil Change" } });
    expect(createButton).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(createButton).toBeEnabled();
  });

  it("links the Terms and Privacy pages from the acceptance checkbox", () => {
    renderSignup();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy-policy");
  });

  it("provisions the workspace immediately when signup returns a session, then enters setup", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
    const { container } = renderSignup();

    fireEvent.submit(fillSignupForm(container));

    await waitFor(() => expect(screen.getByText("SETTINGS SETUP")).toBeInTheDocument());
    expect(signUpMock).toHaveBeenCalledWith("owner@example.com", "secret1", "/login/business");
    expect(provisionMock).toHaveBeenCalledWith("MOMS Mobile Oil Change");
  });

  it("defers provisioning to first sign-in when email confirmation is pending (no session)", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    const { container } = renderSignup();

    fireEvent.submit(fillSignupForm(container));

    await waitFor(() => expect(screen.getByText("BUSINESS LOGIN")).toBeInTheDocument());
    expect(provisionMock).not.toHaveBeenCalled();
  });

  it("sends the account to the sign-in door when provisioning fails after account creation", async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "token" } } });
    provisionMock.mockRejectedValue(new Error("boom"));
    const { container } = renderSignup();

    fireEvent.submit(fillSignupForm(container));

    await waitFor(() => expect(screen.getByText("BUSINESS LOGIN")).toBeInTheDocument());
  });
});

describe("WorkforceAuth no-workspace door", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthMock.mockReturnValue({ session: { user: { id: "user-1" } }, loading: false });
    provisionMock.mockResolvedValue({ workspaceId: "ws-1", slug: "moms-mobile-oil-change", created: true });
    selectWorkspaceMock.mockResolvedValue(ownerMembership);
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("offers workspace creation to a business account with zero memberships", async () => {
    fetchIdentityMock.mockResolvedValue([]);
    renderBusinessLogin();

    expect(await screen.findByText("Create your workspace")).toBeInTheDocument();
    expect(screen.queryByText("Wrong sign-in for this account")).not.toBeInTheDocument();
  });

  it("provisions exactly once from the door and enters the new workspace's setup", async () => {
    fetchIdentityMock
      .mockResolvedValueOnce([])
      .mockResolvedValue([ownerMembership]);
    renderBusinessLogin();

    expect(await screen.findByText("Create your workspace")).toBeInTheDocument();
    const createButton = screen.getByRole("button", { name: "Create workspace" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Business name"), { target: { value: "MOMS Mobile Oil Change" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(createButton).toBeEnabled();
    fireEvent.click(createButton);

    await waitFor(() => expect(screen.getByText("SETTINGS SETUP")).toBeInTheDocument());
    expect(provisionMock).toHaveBeenCalledTimes(1);
    expect(provisionMock).toHaveBeenCalledWith("MOMS Mobile Oil Change");
  });

  it("keeps the role-mismatch guidance on invited-role doors with zero memberships", async () => {
    fetchIdentityMock.mockResolvedValue([]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/login/technician"]}>
          <Routes>
            <Route path="/login/technician" element={<WorkforceAuth intent="login" variant="technician" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Wrong sign-in for this account")).toBeInTheDocument();
    expect(screen.queryByText("Create your workspace")).not.toBeInTheDocument();
  });
});
