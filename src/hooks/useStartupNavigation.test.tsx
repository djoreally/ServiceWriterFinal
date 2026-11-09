/**
 * useStartupNavigation — the startup/post-login landing decision.
 *
 * Locks the shell-seam rule at this decision point: a resolved landing
 * owned by an App Router page (every role landing) must go to the
 * document, because a client-side push from the SPA strands the visit on
 * a blank page; a landing the SPA owns (/plans) stays client-side.
 */
import { useEffect } from "react";
import { renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

jest.mock("@packages/auth", () => ({ useAuth: jest.fn() }));
jest.mock("@/contexts/SubscriptionContext", () => ({ useSubscription: jest.fn() }));
jest.mock("@/hooks/useTeamRole", () => ({ useTeamRole: jest.fn() }));

import { useAuth } from "@packages/auth";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useTeamRole } from "@/hooks/useTeamRole";
import { useStartupNavigation } from "@/hooks/useStartupNavigation";
import { documentNavigation } from "@/lib/auth/landing-navigation";
import { resetStartupRoutingState } from "@/stores/startupRoutingStore";

const useAuthMock = useAuth as jest.Mock;
const useSubscriptionMock = useSubscription as jest.Mock;
const useTeamRoleMock = useTeamRole as jest.Mock;

const pathHolder = { current: "" };

function LocationProbe() {
  const location = useLocation();
  useEffect(() => {
    pathHolder.current = location.pathname;
  }, [location]);
  return null;
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/"]}>
      {children}
      <LocationProbe />
    </MemoryRouter>
  );
}

function mockSignedIn(role: string | null, subscription: unknown, userMetadata: Record<string, unknown> = {}) {
  useAuthMock.mockReturnValue({
    session: { user: { id: "user-1", user_metadata: userMetadata } },
    loading: false,
  });
  useTeamRoleMock.mockReturnValue({ role, loading: false });
  useSubscriptionMock.mockReturnValue({ subscription, loading: false });
}

describe("useStartupNavigation landing seam", () => {
  let replaceSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    replaceSpy = jest.fn();
    jest.spyOn(documentNavigation, "replace").mockImplementation(replaceSpy);
    resetStartupRoutingState();
    pathHolder.current = "";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hands the owner landing (/dashboard, migrated) to the document", () => {
    mockSignedIn("owner", { subscribed: true, status: "active" });

    renderHook(() => useStartupNavigation(), { wrapper });

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith("/dashboard");
    // No client-side navigation happened — the router never moved.
    expect(pathHolder.current).toBe("/");
  });

  it("hands the technician landing (/tech-app, migrated) to the document", () => {
    mockSignedIn("technician", { subscribed: true, status: "active" });

    renderHook(() => useStartupNavigation(), { wrapper });

    expect(replaceSpy).toHaveBeenCalledWith("/tech-app");
    expect(pathHolder.current).toBe("/");
  });

  it("hands the customer portal landing (/customer/dashboard) to the document", () => {
    mockSignedIn(null, { subscribed: true, status: "active" }, { servicewriter_portal: "customer" });

    renderHook(() => useStartupNavigation(), { wrapper });

    expect(replaceSpy).toHaveBeenCalledWith("/customer/dashboard");
    expect(pathHolder.current).toBe("/");
  });

  it("keeps the SPA-owned plan gate (/plans) on the client-side router", () => {
    mockSignedIn("owner", { subscribed: false, status: "requires_plan" });

    renderHook(() => useStartupNavigation(), { wrapper });

    expect(replaceSpy).not.toHaveBeenCalled();
    expect(pathHolder.current).toBe("/plans");
  });
});
