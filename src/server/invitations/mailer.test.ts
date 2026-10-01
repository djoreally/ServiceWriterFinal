jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { sendInvitationEmail } from "@/server/invitations/mailer";

const ACTION_LINK = "https://supabase.example/auth/v1/invite?token=abc123";
const MAGIC_LINK = "https://supabase.example/auth/v1/magiclink?token=xyz789";

const baseInput = {
  invitationId: "inv_123",
  workspaceId: "ws_456",
  recipientEmail: "tech@example.com",
  role: "team_admin",
  token: "tok_abc",
  expiresAt: "2026-10-01T12:00:00.000Z",
};

function mockGenerateLink(implementation: jest.Mock) {
  (createSupabaseAdminClient as jest.Mock).mockReturnValue({
    auth: { admin: { generateLink: implementation } },
  });
}

function inviteSuccess() {
  return jest.fn().mockResolvedValue({
    data: { properties: { action_link: ACTION_LINK } },
    error: null,
  });
}

describe("sendInvitationEmail", () => {
  let resendSend: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    resendSend = jest.spyOn(ResendEmailAdapter.prototype, "send");
    resendSend.mockResolvedValue({
      providerMessageId: "re_inv_1",
      providerName: "resend",
      status: "accepted",
      acceptedAt: "2026-09-22T00:00:00.000Z",
    });
    mockGenerateLink(inviteSuccess());
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
  });

  it("builds the invitation payload and delegates to the Resend adapter", async () => {
    const result = await sendInvitationEmail(baseInput);

    expect(result).toEqual(expect.objectContaining({ status: "accepted", providerMessageId: "re_inv_1" }));
    expect(resendSend).toHaveBeenCalledTimes(1);
    const payload = resendSend.mock.calls[0][0];
    expect(payload).toEqual(expect.objectContaining({
      workspaceId: "ws_456",
      recipient: { email: "tech@example.com" },
      purpose: "authentication",
      templateKey: "workspace_invitation",
      subject: "You’re invited to Service Writer",
      fromName: "Service Writer",
      idempotencyKey: "workspace-invitation:inv_123",
    }));
    expect(payload.metadata).toEqual(expect.objectContaining({
      invitationId: "inv_123",
      role: "team_admin",
      authProvider: "supabase",
    }));
    expect(payload.body).toContain(ACTION_LINK);
    expect(payload.body).toContain("team admin");
    expect(payload.html).toContain(ACTION_LINK);
    expect(payload.html).toContain("team admin");
  });

  it("generates an invite link whose redirect points at the team join page", async () => {
    const generateLink = inviteSuccess();
    mockGenerateLink(generateLink);

    await sendInvitationEmail(baseInput);

    expect(generateLink).toHaveBeenCalledTimes(1);
    const call = generateLink.mock.calls[0][0];
    expect(call).toEqual(expect.objectContaining({
      type: "invite",
      email: "tech@example.com",
    }));
    expect(call.options.redirectTo).toBe(
      "https://servicewriter.xyz/team/join?invitation_id=inv_123&token=tok_abc",
    );
    expect(call.options.data).toEqual(expect.objectContaining({
      servicewriter_invitation_id: "inv_123",
      servicewriter_workspace_id: "ws_456",
      servicewriter_role: "team_admin",
      servicewriter_invitation_expires_at: "2026-10-01T12:00:00.000Z",
    }));
  });

  it("URL-encodes the invitation id and token in the redirect", async () => {
    const generateLink = inviteSuccess();
    mockGenerateLink(generateLink);

    await sendInvitationEmail({ ...baseInput, invitationId: "inv 1/2", token: "tok?&=" });

    const call = generateLink.mock.calls[0][0];
    expect(call.options.redirectTo).toBe(
      "https://servicewriter.xyz/team/join?invitation_id=inv%201%2F2&token=tok%3F%26%3D",
    );
  });

  it("honors NEXT_PUBLIC_APP_URL and trims a trailing slash", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    const generateLink = inviteSuccess();
    mockGenerateLink(generateLink);

    await sendInvitationEmail(baseInput);

    const call = generateLink.mock.calls[0][0];
    expect(call.options.redirectTo).toBe(
      "https://app.example.com/team/join?invitation_id=inv_123&token=tok_abc",
    );
  });

  it("includes the expiry rendered in the workspace timezone", async () => {
    await sendInvitationEmail(baseInput);
    const payload = resendSend.mock.calls[0][0];
    const expected = new Date("2026-10-01T12:00:00.000Z").toLocaleString("en-US", { timeZone: "America/New_York" });
    expect(payload.body).toContain(`This invitation expires ${expected}.`);
  });

  it("falls back to a magic link when the recipient is already registered", async () => {
    const generateLink = jest.fn()
      .mockResolvedValueOnce({
        data: null,
        error: { message: "User already registered" },
      })
      .mockResolvedValueOnce({
        data: { properties: { action_link: MAGIC_LINK } },
        error: null,
      });
    mockGenerateLink(generateLink);

    await sendInvitationEmail(baseInput);

    expect(generateLink).toHaveBeenCalledTimes(2);
    expect(generateLink.mock.calls[0][0].type).toBe("invite");
    expect(generateLink.mock.calls[1][0].type).toBe("magiclink");
    const payload = resendSend.mock.calls[0][0];
    expect(payload.body).toContain(MAGIC_LINK);
    expect(payload.html).toContain(MAGIC_LINK);
  });

  it("throws when invite link generation fails for a new user", async () => {
    mockGenerateLink(jest.fn().mockResolvedValue({
      data: null,
      error: { message: "SMTP exploded" },
    }));

    await expect(sendInvitationEmail(baseInput)).rejects.toThrow(
      "Supabase Auth invitation link generation failed: SMTP exploded",
    );
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("throws when the magic-link fallback also fails", async () => {
    mockGenerateLink(jest.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "User already exists" } })
      .mockResolvedValueOnce({ data: null, error: { message: "rate limited" } }));

    await expect(sendInvitationEmail(baseInput)).rejects.toThrow(
      "Supabase Auth magic-link generation failed: rate limited",
    );
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("propagates Resend adapter failures without swallowing them", async () => {
    resendSend.mockRejectedValue(new Error("Resend request failed with 500"));

    await expect(sendInvitationEmail(baseInput)).rejects.toThrow("Resend request failed with 500");
  });

  it("rejects a non-HTTPS app URL outside local development", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_APP_URL = "http://insecure.example.com";
    try {
      await expect(sendInvitationEmail(baseInput)).rejects.toThrow(
        "Invitation app URL must use HTTPS outside local development",
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("rejects an app URL that is not a valid HTTP(S) URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "ftp://files.example.com";
    await expect(sendInvitationEmail(baseInput)).rejects.toThrow(
      "Invitation app URL must use HTTP or HTTPS",
    );
  });
});
