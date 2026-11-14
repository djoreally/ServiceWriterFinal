/**
 * ScreenMyCalls connection commands (connect / number / mirror / 10DLC /
 * disconnect). Writes go through the typed API client to
 * src/server/hono/routes/screenmycalls.ts.
 *
 * The pairing credential ScreenMyCalls mints at connect time NEVER
 * reaches the browser — the server stores it on the workspace's
 * provider_connections row and every later call rides it server-side.
 */
import { apiClient } from "@/lib/api-client";
import type {
  NumberSearchResult,
  ScreenMyCallsStatus,
  TenDlcRegistrationInput,
  TenDlcState,
} from "@/lib/screenMyCalls";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function workspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before connecting ScreenMyCalls.");
  return context.workspaceId;
}

export interface ConnectScreenMyCallsInput {
  mode: "create" | "link";
  businessName?: string;
  adminEmail?: string;
  linkCode?: string;
}

export async function connectScreenMyCalls(input: ConnectScreenMyCallsInput): Promise<ScreenMyCallsStatus> {
  const response = await apiClient.post<{ data: ScreenMyCallsStatus }>(
    "/v1/integrations/screenmycalls/connect",
    {
      workspace_id: await workspaceId(),
      mode: input.mode,
      business_name: input.businessName,
      admin_email: input.adminEmail,
      link_code: input.linkCode,
    },
  );
  return response.data;
}

export async function searchScreenMyCallsNumbers(input: {
  areaCode?: string;
  state?: string;
  city?: string;
  pattern?: string;
  limit?: number;
}): Promise<NumberSearchResult[]> {
  const response = await apiClient.post<{ data: { numbers: NumberSearchResult[] } }>(
    "/v1/integrations/screenmycalls/numbers/search",
    {
      workspace_id: await workspaceId(),
      area_code: input.areaCode,
      state: input.state,
      city: input.city,
      pattern: input.pattern,
      limit: input.limit,
    },
  );
  return response.data.numbers ?? [];
}

export async function purchaseScreenMyCallsNumber(phoneNumber: string): Promise<{ phoneNumber: string; status: string }> {
  const response = await apiClient.post<{ data: { phoneNumber: string; status: string } }>(
    "/v1/integrations/screenmycalls/numbers/purchase",
    { workspace_id: await workspaceId(), phone_number: phoneNumber },
  );
  return response.data;
}

export async function selectScreenMyCallsNumber(phoneNumber: string): Promise<void> {
  await apiClient.post("/v1/integrations/screenmycalls/numbers/select", {
    workspace_id: await workspaceId(),
    phone_number: phoneNumber,
  });
}

export async function setScreenMyCallsMirror(enabled: boolean): Promise<{ mirrorEnabled: boolean }> {
  const response = await apiClient.post<{ data: { mirrorEnabled: boolean } }>(
    "/v1/integrations/screenmycalls/mirror",
    { workspace_id: await workspaceId(), enabled },
  );
  return response.data;
}

export async function registerScreenMyCalls10Dlc(input: TenDlcRegistrationInput): Promise<TenDlcState> {
  const response = await apiClient.post<{ data: TenDlcState }>(
    "/v1/integrations/screenmycalls/10dlc",
    { workspace_id: await workspaceId(), ...input },
  );
  return response.data;
}

export async function disconnectScreenMyCalls(): Promise<void> {
  await apiClient.post("/v1/integrations/screenmycalls/disconnect", {
    workspace_id: await workspaceId(),
  });
}
