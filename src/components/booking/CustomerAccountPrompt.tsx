/**
 * CustomerAccountPrompt - Email-first checkout flow
 *
 * 1. User enters email
 * 2. System checks if account exists
 * 3. Existing customers can sign in or continue as a guest
 * 4. New customers can create an account or continue as a guest
 *
 * All booking progress is preserved in sessionStorage across login/reset flows.
 */

import { useState } from "react";
import { checkCustomerEmail } from "@/application/queries/booking-account.query";
import { resetPassword } from "@/application/commands/customer-auth.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  User,
  LogIn,
  ArrowRight,
  Loader2,
  KeyRound,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";

interface CustomerAccountPromptProps {
  email: string;
  onEmailChange: (email: string) => void;
  onContinueAsGuest: (prefillData?: { name?: string; phone?: string }) => void;
  onSignIn: () => void;
  onCreateAccount?: (data: {
    email: string;
    password: string;
    name: string;
    phone?: string;
  }) => Promise<void>;
}

export function CustomerAccountPrompt({
  email,
  onEmailChange,
  onContinueAsGuest,
  onSignIn,
  onCreateAccount,
}: CustomerAccountPromptProps) {
  const [checking, setChecking] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [existingName, setExistingName] = useState<string | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Forgot password
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Create account form state
  const [accountName, setAccountName] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountPasswordConfirm, setAccountPasswordConfirm] = useState("");
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleEmailSubmit = async () => {
    if (!email.trim()) {
      setEmailError("Email is required");
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setEmailError(null);
    setChecking(true);

    const goToCreateAccount = () => {
      setExistingName(null);
      setAccountExists(false);
      setShowOptions(true);
    };

    try {
      const result = await checkCustomerEmail(email);

      if (!result) {
        goToCreateAccount();
        return;
      }

      const hasAccount = result.has_account ?? false;

      if (hasAccount) {
        setExistingName(result.customer_name ?? null);
        setAccountExists(true);
        setShowOptions(true);
      } else {
        goToCreateAccount();
      }
    } catch (err) {
      console.error("Error checking email:", err);
      goToCreateAccount();
    } finally {
      setChecking(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleEmailSubmit();
  };

  const handleForgotPassword = async () => {
    setResetSending(true);
    try {
      // Route through the /reset-password page so Supabase's recovery token is
      // processed by a page that knows how to call updateUser. `returnTo` sends
      // the customer back to this exact booking URL (step + slug) once done —
      // the draft itself is persisted in localStorage so it survives even a
      // cross-tab reset flow.
      const bookingUrl = `${window.location.pathname}${window.location.search}`;
      const redirectUrl = `${window.location.origin}/reset-password?returnTo=${encodeURIComponent(bookingUrl)}`;
      const { error } = await resetPassword(email.trim(), redirectUrl);
      if (error) throw error;
      setResetSent(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to send reset email";
      toast.error(msg);
    } finally {
      setResetSending(false);
    }
  };

  const handleCreateAccountSubmit = async () => {
    setAccountError(null);

    if (!accountName.trim()) {
      setAccountError("Full name is required");
      return;
    }
    if (accountPassword.length < 6) {
      setAccountError("Password must be at least 6 characters");
      return;
    }
    if (accountPassword !== accountPasswordConfirm) {
      setAccountError("Passwords do not match");
      return;
    }

    if (!onCreateAccount) return;

    setCreatingAccount(true);
    try {
      await onCreateAccount({
        email: email.trim(),
        password: accountPassword,
        name: accountName.trim(),
        phone: accountPhone.trim() || undefined,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Account creation failed";
      setAccountError(msg);
    } finally {
      setCreatingAccount(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Email Input Section */}
      <div className="space-y-4">
        <div className="mb-4 flex items-start gap-3 text-left">
          <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div><h3 className="text-lg font-semibold">Enter Your Email</h3><p className="text-sm text-muted-foreground">We'll use this to send your appointment confirmation.</p></div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-email">Email Address *</Label>
          <Input
            id="customer-email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => {
              onEmailChange(e.target.value);
              setEmailError(null);
              setShowOptions(false);
              setShowCreateAccount(false);
              setAccountExists(false);
              setResetSent(false);
              setShowForgotPassword(false);
            }}
            onKeyPress={handleKeyPress}
            className={emailError ? "border-destructive" : ""}
          />
          {emailError && (
            <p className="text-sm text-destructive">{emailError}</p>
          )}
        </div>

        <Button
          onClick={handleEmailSubmit}
          disabled={checking || !email.trim()}
          className="w-full"
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>

      {/* Existing account options stay inside the booking experience. */}
      <Dialog
        open={showOptions && !showCreateAccount}
        onOpenChange={(open) => {
          if (!open) {
            setShowOptions(false);
            setShowForgotPassword(false);
            setResetSent(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              {accountExists
                ? `Welcome Back${existingName ? `, ${existingName.split(" ")[0]}` : ""}!`
                : "Account Required"}
            </DialogTitle>
            <DialogDescription>
              {accountExists
                ? "We found an account with this email. Sign in for saved details, or continue as a guest."
                : "Create an account to track service history, or continue as a guest."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-4">
            {accountExists ? (
              <>
                {/* Existing account: Sign In + Forgot Password */}
                {!showForgotPassword ? (
                  <>
                    <Button
                      onClick={() => {
                        setShowOptions(false);
                        onSignIn();
                      }}
                      className="w-full"
                      size="lg"
                    >
                      <LogIn className="w-4 h-4 mr-2" />
                      Sign In to Your Account
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowOptions(false);
                        onContinueAsGuest(existingName ? { name: existingName } : undefined);
                      }}
                      className="w-full"
                    >
                      Continue as Guest
                    </Button>

                    <div className="text-center">
                      <Button
                        variant="link"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => setShowForgotPassword(true)}
                      >
                        <Lock className="w-3 h-3 mr-1" />
                        Forgot your password?
                      </Button>
                    </div>
                  </>
                ) : (
                  /* Forgot Password inline */
                  <div className="space-y-3">
                    {!resetSent ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          We'll send a password reset link to{" "}
                          <strong>{email}</strong>. After resetting, come
                          back to this page — your booking progress will be
                          right where you left it.
                        </p>
                        <Button
                          onClick={handleForgotPassword}
                          disabled={resetSending}
                          className="w-full"
                          size="lg"
                        >
                          {resetSending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Mail className="w-4 h-4 mr-2" />
                              Send Reset Link
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => setShowForgotPassword(false)}
                        >
                          Back to Sign In
                        </Button>
                      </>
                    ) : (
                      <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-md bg-green-500/10 mb-2">
                          <Mail className="w-6 h-6 text-green-500" />
                        </div>
                        <p className="text-sm font-medium">
                          Reset link sent!
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Check your inbox for <strong>{email}</strong>.
                          After resetting your password, return to this
                          page to continue your booking.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setShowForgotPassword(false);
                            setResetSent(false);
                          }}
                        >
                          Back to Sign In
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-center text-muted-foreground pt-2">
                  Your booking progress is saved. After signing in, you'll
                  continue right where you left off.
                </p>
              </>
            ) : (
              <>
                {/* No account: Create Account only */}
                {onCreateAccount && (
                  <Button
                    onClick={() => {
                      setShowOptions(false);
                      setShowCreateAccount(true);
                    }}
                    className="w-full"
                    size="lg"
                  >
                    <ShieldCheck className="w-4 h-4 mr-2" />
                    Create Account & Continue
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowOptions(false);
                    onContinueAsGuest();
                  }}
                  className="w-full"
                >
                  Continue as Guest
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog
        open={showCreateAccount}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateAccount(false);
            setAccountError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Create Your Account
            </DialogTitle>
            <DialogDescription>
              Set a password to track your vehicles, view booking history,
              and speed up future bookings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{email}</span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-name">Full Name *</Label>
              <Input
                id="account-name"
                placeholder="John Doe"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-phone">Phone (optional)</Label>
              <Input
                id="account-phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={accountPhone}
                onChange={(e) => setAccountPhone(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-password">Password *</Label>
              <Input
                id="account-password"
                type="password"
                placeholder="Min. 6 characters"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-password-confirm">
                Confirm Password *
              </Label>
              <Input
                id="account-password-confirm"
                type="password"
                placeholder="Re-enter password"
                value={accountPasswordConfirm}
                onChange={(e) => setAccountPasswordConfirm(e.target.value)}
              />
            </div>

            {accountError && (
              <p className="text-sm text-destructive">{accountError}</p>
            )}

            <Button
              onClick={handleCreateAccountSubmit}
              disabled={creatingAccount}
              className="w-full"
              size="lg"
            >
              {creatingAccount ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Create Account & Continue
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
