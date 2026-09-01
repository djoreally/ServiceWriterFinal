import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, ShieldCheck, Users, XCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithPassword, signUpWithEmail } from "@/application/commands/auth.command";
import { supabase } from "@/integrations/supabase/client";
import { nextApi, type InvitationRecord } from "@/lib/nextApiClient";

const passwordSchema = z.string().min(8, "Use at least 8 characters.");

type InvitationPreview = {
  id: string;
  invited_email: string;
  invited_role: string;
  expires_at: string;
  workspace_name: string;
};

function roleLanding(role: string): string {
  if (role === "customer") return "/customer/dashboard";
  if (role === "technician") return "/tech-app";
  if (role === "fleet_manager") return "/fleet-os";
  if (role === "dispatcher" || role === "manager") return "/dispatch";
  return "/dashboard";
}

export default function InvitationAccept() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const invitationId = params.get("invitation_id") ?? "";
  const token = params.get("token") ?? "";
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [password, setPassword] = useState("");
  const [invitation, setInvitation] = useState<InvitationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invitationId || !token) {
      setError("This invitation link is incomplete.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/invitations/${encodeURIComponent(invitationId)}?token=${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => null) as { data?: InvitationPreview; error?: { message?: string } } | null;
        if (!response.ok || !payload?.data) throw new Error(payload?.error?.message || "This invitation link is invalid or expired.");
        if (cancelled) return;
        setPreview(payload.data);

        const session = (await supabase.auth.getSession()).data.session;
        if (session?.user.email?.toLowerCase() === payload.data.invited_email.toLowerCase()) setMode("signin");
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "This invitation link is invalid or expired.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [invitationId, token]);

  async function authenticateAndAccept(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!preview) return;
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedPassword.success) { setError(parsedPassword.error.issues[0].message); return; }

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const result = await signUpWithEmail(preview.invited_email, parsedPassword.data);
        if (result.error) throw new Error(result.error);
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) {
          toast.success("Account created. Confirm your email, then reopen this invitation link.");
          return;
        }
      } else {
        const result = await signInWithPassword(preview.invited_email, parsedPassword.data);
        if (result.error) throw new Error(result.error);
      }

      const response = await nextApi.invitations.accept(invitationId, token);
      setInvitation(response.data);
      setAccepted(true);
      toast.success("Invitation accepted.");
      window.setTimeout(() => navigate(roleLanding(response.data.invited_role), { replace: true }), 900);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This invitation could not be accepted.";
      if (mode === "signup" && /already|registered|exists/i.test(message)) {
        setMode("signin");
        setError("This email already has an account. Enter its password to accept the invitation.");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error && !preview) return <StateCard icon={<Link2 className="h-7 w-7" />} title="Invalid invitation link" message={error} />;
  if (accepted) return <StateCard icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />} title="You're in" message={`Your ${invitation?.invited_role.replaceAll("_", " ")} access is ready. Redirecting to your workspace…`} />;
  if (!preview) return <StateCard icon={<Link2 className="h-7 w-7" />} title="Invalid invitation link" message="This invitation could not be loaded." />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-7 w-7 text-primary" /></div>
          <div>
            <CardTitle className="text-2xl">Join {preview.workspace_name}</CardTitle>
            <CardDescription className="mt-2">Your email and assigned role are locked to this invitation. Set your password to finish account access.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={authenticateAndAccept} className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Invited email</p>
              <p className="mt-1 font-medium">{preview.invited_email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Role: {preview.invited_role.replaceAll("_", " ")}</p>
            </div>

            <Tabs value={mode} onValueChange={(value) => setMode(value as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signup">Set password</TabsTrigger>
                <TabsTrigger value="signin">Existing account</TabsTrigger>
              </TabsList>
              <TabsContent value="signup" className="mt-3 text-sm text-muted-foreground">Create your Service Writer login for the invited email.</TabsContent>
              <TabsContent value="signin" className="mt-3 text-sm text-muted-foreground">If this email already has a Service Writer account, enter its current password.</TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="accept-password">{mode === "signup" ? "Create password" : "Password"}</Label>
              <Input id="accept-password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
              <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
            </div>

            {error && <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            <Button type="submit" className="w-full gap-2" disabled={submitting}><ShieldCheck className="h-4 w-4" />{submitting ? "Securing access…" : mode === "signin" ? "Sign in & accept" : "Set password & accept"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function StateCard({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="space-y-3 p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{message}</p></CardContent></Card></main>;
}
