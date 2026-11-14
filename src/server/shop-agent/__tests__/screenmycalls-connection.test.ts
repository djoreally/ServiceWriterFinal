/**
 * Tests for the ScreenMyCalls connection (ServiceWriter hub side):
 * the pairing API client and the provider_connections credential store.
 *
 * Pins the tenancy rules on this side of the wire:
 *  - bootstrap calls ride the PLATFORM key and name the workspace the
 *    connection belongs to — the credential comes back bound to it;
 *  - every later call rides the workspace's OWN pairing credential;
 *  - credentials are stored per workspace and one workspace's stored
 *    credential is never returned for another;
 *  - disconnect revokes the credential so it authenticates nothing.
 */
import { describe, it, expect } from "@jest/globals";
import {
  ScreenMyCallsApiError,
  ScreenMyCallsClient,
} from "../screenmycalls-client";
import {
  clearScreenMyCallsConnection,
  getScreenMyCallsConnection,
  saveScreenMyCallsConnection,
  setScreenMyCallsConnectionNumber,
} from "../screenmycalls-connection";
import type { ShopAgentSupabase } from "../channels/db";
import { FakeSupabase } from "../channels/test-support/fake-supabase";

const WS_A = "11111111-1111-4111-8111-111111111111";
const WS_B = "22222222-2222-4222-8222-222222222222";

interface CapturedCall {
  url: string;
  init: Record<string, unknown>;
}

function stubFetch(responseBody: Record<string, unknown>, status = 200) {
  const calls: CapturedCall[] = [];
  const fetchImpl = async (url: string, init: Record<string, unknown>) => {
    calls.push({ url, init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => responseBody,
      text: async () => JSON.stringify(responseBody),
    };
  };
  return { calls, fetchImpl };
}

describe("ScreenMyCallsClient", () => {
  it("createOrg authenticates with the platform key and names the workspace", async () => {
    const { calls, fetchImpl } = stubFetch({
      keyId: "swp_1", secret: "sws_1", organizationId: "org_1",
      organizationName: "MOMS", intakeUrl: "https://www.servicewriter.xyz/api/v1/shop-agent/screenmycalls",
      mirrorEnabled: false,
    }, 201);
    const client = new ScreenMyCallsClient({
      baseUrl: "https://www.screenmycalls.app",
      platformKey: "platform-key",
      fetchImpl: fetchImpl as never,
    });
    const result = await client.createOrg({
      swWorkspaceId: WS_A,
      businessName: "MOMS Mobile Oil Change",
      adminEmail: "owner@example.com",
      intakeUrl: "https://www.servicewriter.xyz/api/v1/shop-agent/screenmycalls",
    });
    expect(result.organizationId).toBe("org_1");
    expect(calls).toHaveLength(1);
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers["x-smc-platform-key"]).toBe("platform-key");
    const sent = JSON.parse(String(calls[0].init.body)) as Record<string, unknown>;
    expect(sent.action).toBe("create_org");
    expect(sent.sw_workspace_id).toBe(WS_A);
  });

  it("credential actions ride the pairing credential, never the platform key", async () => {
    const { calls, fetchImpl } = stubFetch({ mirrorEnabled: true });
    const client = new ScreenMyCallsClient({
      baseUrl: "https://www.screenmycalls.app",
      platformKey: "platform-key",
      fetchImpl: fetchImpl as never,
    });
    await client.credentialAction({ keyId: "swp_1", secret: "sws_1" }, "mirror.set", { enabled: true });
    const headers = (calls[0].init.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sws_1");
    expect(headers["x-smc-key-id"]).toBe("swp_1");
    expect(headers["x-smc-platform-key"]).toBeUndefined();
  });

  it("refuses bootstrap without a platform key and surfaces API errors", async () => {
    const noKey = new ScreenMyCallsClient({ baseUrl: "https://x", platformKey: "", fetchImpl: (async () => { throw new Error("should not be called"); }) as never });
    await expect(noKey.createOrg({ swWorkspaceId: WS_A, businessName: "B", adminEmail: "a@b.c", intakeUrl: "https://i" }))
      .rejects.toBeInstanceOf(ScreenMyCallsApiError);

    const { fetchImpl } = stubFetch({ error: "link_code_invalid", message: "That link code is not valid." }, 400);
    const client = new ScreenMyCallsClient({ baseUrl: "https://x", platformKey: "k", fetchImpl: fetchImpl as never });
    await expect(client.redeemLinkCode({ swWorkspaceId: WS_A, linkCode: "bad", intakeUrl: "https://i" }))
      .rejects.toMatchObject({ status: 400, code: "link_code_invalid" });
  });
});

describe("connection store (provider_connections)", () => {
  it("stores, reads back, and scopes credentials per workspace", async () => {
    const fake = new FakeSupabase({ provider_connections: [] });
    const supabase = fake as unknown as ShopAgentSupabase;

    await saveScreenMyCallsConnection(supabase, WS_A, {
      keyId: "swp_a", secret: "sws_a", smcOrgId: "org_a", smcOrgName: "Shop A",
    });
    await saveScreenMyCallsConnection(supabase, WS_B, {
      keyId: "swp_b", secret: "sws_b", smcOrgId: "org_b", smcOrgName: "Shop B",
    });

    const a = await getScreenMyCallsConnection(supabase, WS_A);
    const b = await getScreenMyCallsConnection(supabase, WS_B);
    expect(a?.keyId).toBe("swp_a");
    expect(a?.secret).toBe("sws_a");
    expect(b?.keyId).toBe("swp_b");
    expect(b?.secret).toBe("sws_b");

    await setScreenMyCallsConnectionNumber(supabase, WS_A, "+12155550100");
    const a2 = await getScreenMyCallsConnection(supabase, WS_A);
    expect(a2?.number).toBe("+12155550100");
    // Setting A's number must not touch B's row.
    const b2 = await getScreenMyCallsConnection(supabase, WS_B);
    expect(b2?.number).toBeNull();
  });

  it("disconnect revokes the credential so it resolves to nothing", async () => {
    const fake = new FakeSupabase({ provider_connections: [] });
    const supabase = fake as unknown as ShopAgentSupabase;
    await saveScreenMyCallsConnection(supabase, WS_A, {
      keyId: "swp_a", secret: "sws_a", smcOrgId: "org_a",
    });
    expect(await getScreenMyCallsConnection(supabase, WS_A)).not.toBeNull();
    await clearScreenMyCallsConnection(supabase, WS_A);
    expect(await getScreenMyCallsConnection(supabase, WS_A)).toBeNull();
  });

  it("ignores other providers' rows in the same workspace", async () => {
    const fake = new FakeSupabase({
      provider_connections: [
        { workspace_id: WS_A, provider: "agentphone", metadata: { agent_id: "x", secret: "not-ours" } },
      ],
    });
    const supabase = fake as unknown as ShopAgentSupabase;
    expect(await getScreenMyCallsConnection(supabase, WS_A)).toBeNull();
  });
});
