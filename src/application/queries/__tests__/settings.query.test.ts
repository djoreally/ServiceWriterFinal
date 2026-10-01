/**
 * Contract tests for the rewritten `src/application/queries/settings.query.ts`.
 *
 * The module now talks to `GET/PUT /api/v1/workspace-context` (and
 * `/slug-availability`) through `@/lib/api-client`. Every exported signature
 * is unchanged; these tests pin the wire contract and the caching behavior
 * the ~95 importers rely on.
 */
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { getSelectedWorkspaceId } from "@/application/queries/workspaces.selection";
import { apiClient, ApiClientError } from "@/lib/api-client";
import {
  checkSlugAvailability,
  fetchBusinessSettings,
  invalidateBusinessSettings,
  resetCurrentWorkspaceCache,
  resolveCurrentWorkspace,
  saveBusinessSettings,
  type BusinessProfileSettings,
} from "@/application/queries/settings.query";

jest.mock("@/lib/api-client", () => {
  class ApiClientError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
      this.name = "ApiClientError";
    }
  }
  return {
    apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() },
    ApiClientError,
  };
});

jest.mock("@/lib/auth/current-user", () => ({
  getCurrentAuthUser: jest.fn(),
}));

jest.mock("@/application/queries/workspaces.selection", () => ({
  getSelectedWorkspaceId: jest.fn(),
}));

const mockedGet = apiClient.get as jest.Mock;
const mockedPut = apiClient.put as jest.Mock;
const mockedGetUser = getCurrentAuthUser as jest.Mock;
const mockedGetSelected = getSelectedWorkspaceId as jest.Mock;

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";

const SETTINGS_FIXTURE: BusinessProfileSettings = {
  id: WORKSPACE_ID,
  user_id: USER_ID,
  business_name: "Test Shop",
  owner_name: "Owner",
  phone: "555-0100",
  email: "shop@example.com",
  address: "1 Main St",
  logo_url: "",
  terminology: { customer: "Customer", vehicle: "Vehicle", service: "Service", quote: "Quote" },
  date_format: "MM/DD/YYYY hh:mm A",
  timezone: "America/New_York",
  currency: "USD",
  opening_time: "09:00",
  closing_time: "17:00",
  working_days: ["Monday"],
  booking_slug: "test-shop",
  service_radius_miles: 25,
  service_address: "1 Main St",
  service_coordinates: null,
};

function contextBundle(settings: BusinessProfileSettings | null = SETTINGS_FIXTURE) {
  return { workspaceId: WORKSPACE_ID, businessSettings: settings };
}

beforeEach(() => {
  jest.clearAllMocks();
  resetCurrentWorkspaceCache();
  invalidateBusinessSettings();
  mockedGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockedGetSelected.mockReturnValue(null);
});

describe("resolveCurrentWorkspace", () => {
  it("resolves {workspaceId, userId} from the workspace-context endpoint", async () => {
    mockedGet.mockResolvedValue(contextBundle());

    const result = await resolveCurrentWorkspace();

    expect(result).toEqual({ workspaceId: WORKSPACE_ID, userId: USER_ID });
    expect(mockedGet).toHaveBeenCalledWith("/v1/workspace-context", {
      query: { selected_workspace_id: undefined },
    });
  });

  it("passes the selected workspace id through as a query hint", async () => {
    mockedGetSelected.mockReturnValue(WORKSPACE_ID);
    mockedGet.mockResolvedValue(contextBundle());

    await resolveCurrentWorkspace();

    expect(mockedGet).toHaveBeenCalledWith("/v1/workspace-context", {
      query: { selected_workspace_id: WORKSPACE_ID },
    });
  });

  it("returns null without hitting the network when there is no user", async () => {
    mockedGetUser.mockResolvedValue({ data: { user: null } });

    await expect(resolveCurrentWorkspace()).resolves.toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("shares one in-flight request and caches by user+selection", async () => {
    mockedGet.mockResolvedValue(contextBundle());

    const [first, second] = await Promise.all([resolveCurrentWorkspace(), resolveCurrentWorkspace()]);
    const third = await resolveCurrentWorkspace();

    expect(first).toEqual({ workspaceId: WORKSPACE_ID, userId: USER_ID });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("returns null when the user has no workspace", async () => {
    mockedGet.mockResolvedValue({ workspaceId: null, businessSettings: null });

    await expect(resolveCurrentWorkspace()).resolves.toBeNull();
  });
});

describe("fetchBusinessSettings", () => {
  it("returns the business settings from the context bundle", async () => {
    mockedGet.mockResolvedValue(contextBundle());

    const result = await fetchBusinessSettings();

    expect(result).toEqual(SETTINGS_FIXTURE);
  });

  it("reuses the cached settings seeded by resolveCurrentWorkspace", async () => {
    mockedGet.mockResolvedValue(contextBundle());

    await resolveCurrentWorkspace();
    const result = await fetchBusinessSettings();

    expect(result).toEqual(SETTINGS_FIXTURE);
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it("returns null (never throws) when the request fails", async () => {
    mockedGet.mockRejectedValue(new ApiClientError(401, "unauthenticated", "Authentication required"));

    await expect(fetchBusinessSettings()).resolves.toBeNull();
  });
});

describe("saveBusinessSettings", () => {
  it("PUTs the profile (id/user_id stripped) and invalidates the cache", async () => {
    mockedGet.mockResolvedValue(contextBundle());
    mockedPut.mockResolvedValue({ success: true });

    const result = await saveBusinessSettings(SETTINGS_FIXTURE, "new-slug");

    expect(result).toEqual({ success: true });
    expect(mockedPut).toHaveBeenCalledWith(
      "/v1/workspace-context",
      {
        slug: "new-slug",
        profile: expect.not.objectContaining({ id: expect.anything(), user_id: expect.anything() }),
      },
      { query: { selected_workspace_id: WORKSPACE_ID } },
    );
    expect((mockedPut.mock.calls[0] as unknown[])[1]).toMatchObject({
      profile: expect.objectContaining({ business_name: "Test Shop" }),
    });

    // Cache was invalidated: the next read hits the network again.
    await fetchBusinessSettings();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it("maps slug_taken to the friendly booking-link message", async () => {
    mockedGet.mockResolvedValue(contextBundle());
    mockedPut.mockRejectedValue(new ApiClientError(409, "slug_taken", "This booking link is already taken. Please choose another."));

    const result = await saveBusinessSettings(SETTINGS_FIXTURE, "taken");

    expect(result).toEqual({
      success: false,
      error: "This booking link is already taken. Please choose another.",
    });
  });

  it("returns a failure envelope for other errors", async () => {
    mockedGet.mockResolvedValue(contextBundle());
    mockedPut.mockRejectedValue(new ApiClientError(500, "internal_error", "Boom"));

    const result = await saveBusinessSettings(SETTINGS_FIXTURE, "x");

    expect(result).toEqual({ success: false, error: "Boom" });
  });

  it("returns Not authenticated when there is no workspace context", async () => {
    mockedGetUser.mockResolvedValue({ data: { user: null } });

    const result = await saveBusinessSettings(SETTINGS_FIXTURE, "x");

    expect(result).toEqual({ success: false, error: "Not authenticated" });
    expect(mockedPut).not.toHaveBeenCalled();
  });
});

describe("checkSlugAvailability", () => {
  it("returns null for short slugs without hitting the network", async () => {
    await expect(checkSlugAvailability("ab")).resolves.toBeNull();
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("returns false for slugs with invalid characters", async () => {
    await expect(checkSlugAvailability("Bad Slug!")).resolves.toBe(false);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it("delegates to the slug-availability endpoint", async () => {
    mockedGet.mockImplementation(async (path: string) => {
      if (path === "/v1/workspace-context/slug-availability") return { available: true };
      return contextBundle();
    });

    await expect(checkSlugAvailability("free-slug")).resolves.toBe(true);
    expect(mockedGet).toHaveBeenCalledWith("/v1/workspace-context/slug-availability", {
      query: { slug: "free-slug", selected_workspace_id: WORKSPACE_ID },
    });
  });

  it("returns null when the request fails", async () => {
    mockedGet.mockImplementation(async (path: string) => {
      if (path === "/v1/workspace-context/slug-availability") {
        throw new ApiClientError(401, "unauthenticated", "Authentication required");
      }
      return contextBundle();
    });

    await expect(checkSlugAvailability("free-slug")).resolves.toBeNull();
  });
});
