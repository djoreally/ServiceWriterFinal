import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePassword } from "@/application/commands/auth.command";

/**
 * Password reset landing page. Honors a `returnTo` query param so flows like
 * the public booking checkout can send users back to where they left off with
 * their in-progress draft intact (draft is persisted in localStorage under
 * `booking-<slug>`).
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSafeReturnTo = (path: string | null): path is string =>
    !!path && path.startsWith("/") && !path.startsWith("//");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await updatePassword(password);
      if (result.error) throw new Error(result.error);
      toast.success("Password updated. Resuming where you left off.");
      if (isSafeReturnTo(returnTo)) {
        navigate(returnTo, { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <KeyRound className="mx-auto mb-4 h-10 w-10 text-primary" />
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least 8 characters for your new password.
            {isSafeReturnTo(returnTo) && (
              <span className="mt-1 block text-xs text-muted-foreground">
                You'll be returned to your booking after saving.
              </span>
            )}
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
            <Button className="w-full" type="submit" disabled={loading}>
              {loading ? "Saving…" : "Save new password"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link className="text-primary" to={isSafeReturnTo(returnTo) ? returnTo : "/login"}>
                {isSafeReturnTo(returnTo) ? "Back to booking" : "Back to sign in"}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
