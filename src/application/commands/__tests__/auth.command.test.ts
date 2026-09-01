jest.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signInWithOtp: jest.fn(),
    },
    rpc: jest.fn(),
  },
  authSupabase: {
    auth: {
      signInWithPassword: jest.fn(),
      signInWithOtp: jest.fn(),
    },
  },
}));

import { authSupabase } from "@/integrations/supabase/client";
import { getSafeSignInError, requestMagicLink, signInWithPassword } from "@/application/commands/auth.command";

describe("getSafeSignInError", () => {
  it("does not reveal whether credentials or account state caused rejection", () => {
    expect(getSafeSignInError({ status: 400, message: "Invalid login credentials" }))
      .toBe("Invalid email or password. Please check your credentials and try again.");
    expect(getSafeSignInError({ status: 400, message: "Email not confirmed" }))
      .toBe("Email address not confirmed. Please check your inbox for the confirmation link.");
  });

  it("gives actionable messages for service and rate-limit failures", () => {
    expect(getSafeSignInError({ status: 429, message: "rate limit exceeded" }))
      .toBe("Too many attempts. Please wait a few minutes before trying again or try signing in with your email and password.");
    expect(getSafeSignInError({ status: 503, message: "service unavailable" }))
      .toBe("The authentication service is temporarily unavailable. Please try again in a moment.");
    expect(getSafeSignInError({ status: 400, code: "email_provider_disabled" }))
      .toBe("Email sign-in is disabled for this app environment. Use Continue with Google, or enable Email sign-in for the same environment you are testing.");
  });

  it("treats aborted and status-0 transport failures as backend unavailability, not bad credentials", () => {
    const unavailable = "The authentication service is temporarily unavailable. Please try again in a moment.";
    expect(getSafeSignInError({ status: 0, message: "signal is aborted without reason" })).toBe(unavailable);
    expect(getSafeSignInError({ message: "The user aborted a request." })).toBe(unavailable);
    expect(getSafeSignInError({ status: 500, message: "Database error querying schema" })).toBe(unavailable);
    expect(getSafeSignInError({ code: "request_timeout", message: "The sign-in request timed out." })).toBe(unavailable);
  });
});


describe("requestMagicLink", () => {
  const signInWithOtp = authSupabase.auth.signInWithOtp as jest.Mock;

  beforeEach(() => signInWithOtp.mockReset());

  it("requests a link without creating an unknown business-owner account", async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    await expect(requestMagicLink("owner@example.com")).resolves.toEqual({ sent: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: expect.objectContaining({ shouldCreateUser: false }),
    });
  });

  it("does not claim an email was sent when delivery is unavailable", async () => {
    signInWithOtp.mockResolvedValue({
      error: { code: "email_provider_disabled", status: 400, name: "AuthApiError" },
    });

    await expect(requestMagicLink("owner@example.com")).resolves.toEqual({
      sent: false,
      error: "Magic links are disabled for this app environment. Use Continue with Google, or enable Email sign-in for the same environment you are testing.",
    });
  });
});

describe("signInWithPassword", () => {
  const passwordSignIn = authSupabase.auth.signInWithPassword as jest.Mock;

  beforeEach(() => passwordSignIn.mockReset());

  it("performs exactly one credential exchange on success", async () => {
    passwordSignIn.mockResolvedValue({ error: null });

    await expect(signInWithPassword("owner@example.com", "correct-password")).resolves.toEqual({});
    expect(passwordSignIn).toHaveBeenCalledTimes(1);
    expect(passwordSignIn).toHaveBeenCalledWith({
      email: "owner@example.com",
      password: "correct-password",
    });
  });

  it("does not retry a transient failed credential mutation", async () => {
    passwordSignIn.mockResolvedValue({
      error: { status: 503, message: "service unavailable" },
    });

    await expect(signInWithPassword("owner@example.com", "password")).resolves.toEqual({
      error: "The authentication service is temporarily unavailable. Please try again in a moment.",
    });
    expect(passwordSignIn).toHaveBeenCalledTimes(1);
  });
});
