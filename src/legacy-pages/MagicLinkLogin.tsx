import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { z } from "zod";
import { requestMagicLink } from "@/application/commands/auth.command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const emailSchema = z.string().email("Enter a valid email address");

export default function MagicLinkLogin() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const result = await requestMagicLink(parsed.data);
      if (result.sent === false) {
        toast.error(result.error);
        return;
      }
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to send magic link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {sent ? <CheckCircle2 className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
          </div>
          <CardTitle>{sent ? "Check your email" : "Sign in with a magic link"}</CardTitle>
          <CardDescription>
            {sent
              ? `If an account exists for ${email}, we've sent a secure sign-in link. Open it on this device to continue.`
              : "We'll email you a secure link — no password required."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                Send another link
              </Button>
              <Link
                to="/login"
                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:underline"
              >
                <ArrowLeft className="h-3 w-3" /> Back to sign in options
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? "Sending…" : "Email me a magic link"}
              </Button>
              <div className="pt-2 text-center text-sm">
                <Link to="/login" className="text-muted-foreground hover:underline">
                  Prefer a password? Sign in
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
