/**
 * ScreenMyCalls pairing API client (server-side only).
 *
 * ServiceWriter is the hub of the ScreenMyCalls bundle: the connection
 * is created HERE, in the shop's ServiceWriter workspace, and this
 * client is how the connection flow talks to ScreenMyCalls.
 *
 * Two credential tiers, never mixed:
 * - PLATFORM key (`SCREENMYCALLS_PLATFORM_KEY`, env-only): authenticates
 *   ServiceWriter-the-platform for the two bootstrap actions that mint a
 *   pairing (create_org for a brand-new shop, redeem_link_code for a
 *   shop that already has a ScreenMyCalls org). It is never stored per
 *   workspace and never leaves the server.
 * - PAIRING credential (per workspace): minted by ScreenMyCalls during
 *   bootstrap and stored on the workspace's provider_connections row
 *   (provider = "screenmycalls"). It IS the tenant binding — every later
 *   call (status, numbers, 10DLC, mirror toggle, and the booking mirror
 *   intake in the other direction) is scoped by it, and ScreenMyCalls
 *   resolves the org from the credential alone.
 */

export const SCREENMYCALLS_API_URL_ENV = "SCREENMYCALLS_API_URL";
export const SCREENMYCALLS_PLATFORM_KEY_ENV = "SCREENMYCALLS_PLATFORM_KEY";
export const DEFAULT_SCREENMYCALLS_API_URL = "https://www.screenmycalls.app";
export const SCREENMYCALLS_INTAKE_PATH = "/api/v1/shop-agent/screenmycalls";

export interface PairingCredential {
  keyId: string;
  secret: string;
}

export interface PairingBootstrapResult extends PairingCredential {
  organizationId: string;
  organizationName: string;
  intakeUrl: string;
  mirrorEnabled: boolean;
}

export class ScreenMyCallsApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type FetchImpl = (url: string, init: Record<string, unknown>) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}>;

export interface ScreenMyCallsClientDeps {
  baseUrl?: string;
  platformKey?: string;
  fetchImpl?: FetchImpl;
}

export class ScreenMyCallsClient {
  private baseUrl: string;
  private platformKey: string;
  private fetchImpl: FetchImpl;

  constructor(deps: ScreenMyCallsClientDeps = {}) {
    this.baseUrl = (deps.baseUrl ?? process.env[SCREENMYCALLS_API_URL_ENV] ?? DEFAULT_SCREENMYCALLS_API_URL).replace(/\/$/, "");
    this.platformKey = deps.platformKey ?? process.env[SCREENMYCALLS_PLATFORM_KEY_ENV] ?? "";
    this.fetchImpl = deps.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  }

  get configured(): boolean {
    return Boolean(this.platformKey);
  }

  private async request(
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    let res;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/api/servicewriter/pairing`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ScreenMyCallsApiError(502, "screenmycalls_unreachable",
        err instanceof Error ? err.message : "ScreenMyCalls did not answer");
    }
    const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !parsed) {
      throw new ScreenMyCallsApiError(
        res.status,
        typeof parsed?.error === "string" ? parsed.error : "screenmycalls_error",
        typeof parsed?.message === "string" ? parsed.message : `ScreenMyCalls returned ${res.status}`,
      );
    }
    return parsed;
  }

  private platformHeaders(): Record<string, string> {
    if (!this.platformKey) {
      throw new ScreenMyCallsApiError(503, "platform_not_configured",
        `${SCREENMYCALLS_PLATFORM_KEY_ENV} is not configured on the ServiceWriter server`);
    }
    return { "x-smc-platform-key": this.platformKey };
  }

  private credentialHeaders(cred: PairingCredential): Record<string, string> {
    return {
      authorization: `Bearer ${cred.secret}`,
      "x-smc-key-id": cred.keyId,
    };
  }

  /** Bootstrap: create a brand-new ScreenMyCalls org for this shop (bundle). */
  async createOrg(input: {
    swWorkspaceId: string;
    businessName: string;
    adminEmail: string;
    intakeUrl: string;
  }): Promise<PairingBootstrapResult> {
    const res = await this.request(this.platformHeaders(), {
      action: "create_org",
      sw_workspace_id: input.swWorkspaceId,
      business_name: input.businessName,
      admin_email: input.adminEmail,
      intake_url: input.intakeUrl,
    });
    return res as unknown as PairingBootstrapResult;
  }

  /** Bootstrap: link an EXISTING ScreenMyCalls org via its link code. */
  async redeemLinkCode(input: {
    swWorkspaceId: string;
    linkCode: string;
    intakeUrl: string;
  }): Promise<PairingBootstrapResult> {
    const res = await this.request(this.platformHeaders(), {
      action: "redeem_link_code",
      sw_workspace_id: input.swWorkspaceId,
      link_code: input.linkCode,
      intake_url: input.intakeUrl,
    });
    return res as unknown as PairingBootstrapResult;
  }

  /** All post-bootstrap actions ride the pairing credential. */
  async credentialAction(
    cred: PairingCredential,
    action: string,
    body: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    return this.request(this.credentialHeaders(cred), { action, ...body });
  }
}
