/**
 * jest.mock factory for `@/server/api`.
 *
 * Keeps the REAL `json`, `ApiError`, `errorResponse`, `paginationSchema`,
 * `workspaceIdSchema`, etc. via `jest.requireActual`, and overrides only the
 * credential-bearing functions (`requireUser`, `requireWorkspaceMember`,
 * `requireWorkspacePaymentsAddon`, `requireCrmCapability`) with controllable
 * implementations driven by `authState` from `./state`.
 *
 * The real `@/server/hono/middleware/auth` wrappers delegate to these, so a
 * single mock covers both direct `@/server/api` users (vehicles, messaging)
 * and middleware users (every other router).
 *
 * Usage (top of each test file):
 *   jest.mock("@/server/api", () =>
 *     require("../test-support/serverApiMock").makeServerApiMock(
 *       jest.requireActual("@/server/api"),
 *     ),
 *   );
 */
import { authState, mockSupabase, USER_ID, WS_ID } from "./state";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fakeUser() {
  return { id: USER_ID, email: "tech@example.com" };
}

function fakeMembership() {
  return {
    workspace_id: WS_ID,
    user_id: USER_ID,
    role: authState.role,
    is_active: true,
  };
}

export function makeServerApiMock(actual: Record<string, unknown>) {
  const ApiError = actual.ApiError as new (
    status: number,
    message: string,
    code?: string,
  ) => Error;

  async function requireUser(_request?: Request) {
    if (authState.mode === "unauthorized") {
      throw new ApiError(401, "Authentication required", "unauthenticated");
    }
    return { supabase: mockSupabase, user: fakeUser() };
  }

  async function requireWorkspaceMember(
    workspaceId: string,
    roles?: string[],
    _request?: Request,
  ) {
    // Mirrors the real implementation's workspace_id validation.
    if (!UUID_RE.test(workspaceId)) {
      throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
    }
    if (authState.mode === "unauthorized") {
      throw new ApiError(401, "Authentication required", "unauthenticated");
    }
    if (authState.mode === "forbidden") {
      throw new ApiError(
        403,
        "You are not a member of this workspace",
        "forbidden",
      );
    }
    const membership = fakeMembership();
    if (roles && !roles.includes(membership.role)) {
      throw new ApiError(403, "Insufficient workspace permissions", "forbidden");
    }
    return { supabase: mockSupabase, user: fakeUser(), membership };
  }

  async function requireWorkspacePaymentsAddon(
    workspaceId: string,
    roles?: string[],
    request?: Request,
  ) {
    const authorized = await requireWorkspaceMember(workspaceId, roles, request);
    if (authState.mode === "payments_required") {
      throw new ApiError(
        402,
        "The Payments add-on is required for this workspace",
        "payments_addon_required",
      );
    }
    return {
      ...authorized,
      billing: { payments_addon_active: true, subscription_status: "active" },
    };
  }

  async function requireCrmCapability(
    request: Request,
    workspaceId: string,
    capability: string,
  ) {
    if (!UUID_RE.test(workspaceId)) {
      throw new ApiError(400, "Invalid workspace_id", "invalid_workspace");
    }
    const { supabase, user } = await requireUser(request);
    const { data, error } = await (
      supabase as {
        rpc: (fn: string, params: unknown) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("has_crm_capability", {
      target_workspace_id: workspaceId,
      required_capability: capability,
    });
    if (error) throw error;
    if (data !== true) {
      throw new ApiError(403, "CRM capability required", "crm_forbidden");
    }
    return { supabase, user };
  }

  return {
    ...actual,
    requireUser,
    requireWorkspaceMember,
    requireWorkspacePaymentsAddon,
    requireCrmCapability,
  };
}
