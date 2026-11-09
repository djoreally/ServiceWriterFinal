/**
 * The post-login landing seam: a landing target owned by an App Router
 * page must be handed to the document (a real load boots the shell that
 * owns the URL), while an SPA-owned target keeps the client-side router
 * navigation. A client-side push to a migrated target is the blank
 * post-sign-in landing reproduced live on 2026-11-09.
 */
import type { NavigateFunction } from "react-router-dom";
import { documentNavigation, navigatePostLogin } from "@/lib/auth/landing-navigation";

describe("navigatePostLogin", () => {
  const navigate = jest.fn();
  let replaceSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    replaceSpy = jest.fn();
    jest.spyOn(documentNavigation, "replace").mockImplementation(replaceSpy);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("hands a migrated landing target to the document, never to the router", () => {
    navigatePostLogin(navigate as unknown as NavigateFunction, "/dashboard");

    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalledWith("/dashboard");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("preserves the full target, query included, on the document path", () => {
    navigatePostLogin(navigate as unknown as NavigateFunction, "/settings?tab=business&setup=1");

    expect(replaceSpy).toHaveBeenCalledWith("/settings?tab=business&setup=1");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps an SPA-owned landing target on the client-side router", () => {
    navigatePostLogin(navigate as unknown as NavigateFunction, "/plans");

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith("/plans", { replace: true });
    expect(replaceSpy).not.toHaveBeenCalled();
  });
});
