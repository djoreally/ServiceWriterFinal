import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/application/commands/auth.command";
import { signOut } from "@/application/commands/signout.command";
import { authSupabase } from "@/integrations/supabase/client";

/**
 * Password reset landing page. Supabase recovery links establish a short-lived
 * authenticated session before the password may be changed. Do not present an
 * actionable password form until that session is actually available.
 *
 * Honors a `returnTo` query param so customer-booking flows can send users back
 * to their in-progress draft after they deliberately sign in again.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [checkingRecovery, setCheckingRecovery] = useState(true);

  const isSafeReturnTo = (path: string | null): path is string =>
    !!path && path.startsWith("/") && !path.startsWith("//");

  useEffect(() => {
    let active = true;

    const markReady = () => {
      if (!active) return;
      setRecoveryReady(true);
      setCheckingRecovery(false);
    };

    const { data: { subscription } } = authSupabase.auth.onAuthStateChange((event, session) => {
      if (!session) return;
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        markReady();
      }
    });

    void authSupabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) {
          markReady();
        } else {
          setCheckingRecovery(false);
        }
      })
      .catch(() => {
        if (active) setCheckingRecovery(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!recoveryReady) {
      toast.error("This reset link is invalid or has expired. Request a new one.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(password);
      if (result.error) throw new Error(result.error);

      // End the recovery session deliberately. The next successful access must
      // prove that the newly selected password works instead of silently
      // continuing on the one-time recovery session.
      await signOut();
      toast.success("Password updated. Sign in with your new password.");

      const next = isSafeReturnTo(returnTo)
        ? `/login?next=${encodeURIComponent(returnTo)}`
        : "/login";
      navigate(next, { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingRecovery) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Verifying your password reset link…
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!recoveryReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <KeyRound className="mx-auto mb-4 h-10 w-10 text-primary" />
            <CardTitle>Reset link expired</CardTitle>
            <CardDescription>
              This password reset link is invalid, expired, or has already been used.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" asChild>
              <Link to="/forgot-password">Send a new reset link</Link>
            </Button>
            <Button className="w-full" variant="outline" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <KeyRound className="mx-auto mb-4 h-10 w-10 text-primary" />
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least 8 characters. After saving, sign in with the new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save new password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link className="text-primary" to="/login">Back to sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
