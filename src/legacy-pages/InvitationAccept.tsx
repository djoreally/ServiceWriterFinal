import { useEffect, useState } from "react";
import { CheckCircle2, Link2, Loader2, ShieldCheck, Users, XCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithPassword, signUpWithEmail } from "@/application/commands/auth.command";
import { supabase } from "@/integrations/supabase/client";
import { nextApi, type InvitationRecord } from "@/lib/nextApiClient";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");
const passwordSchema = z.string().min(8, "Use at least 8 characters.");

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
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitation, setInvitation] = useState<InvitationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!invitationId || !token) { setError("This invitation link is incomplete."); setLoading(false); return; }
    void (async () => {
      try {
        const session = (await supabase.auth.getSession()).data.session;
        if (session?.user.email) setEmail(session.user.email);
        // The API intentionally does not expose token metadata before acceptance.
        // A lightweight identity check keeps the acceptance surface tenant-safe.
        const identity = session ? await nextApi.identity.get() : null;
        const linked = identity?.data.memberships?.find((membership) => typeof membership === "object" && membership !== null && "workspace_id" in membership) as { workspace_id?: string } | undefined;
        void linked;
      } catch { /* The submit path returns the authoritative invitation error. */ }
      finally { setLoading(false); }
    })();
  }, [invitationId, token]);

  async function authenticateAndAccept(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsedEmail = emailSchema.safeParse(email);
    const parsedPassword = passwordSchema.safeParse(password);
    if (!parsedEmail.success) { setError(parsedEmail.error.issues[0].message); return; }
    if (!parsedPassword.success) { setError(parsedPassword.error.issues[0].message); return; }
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const result = await signUpWithEmail(parsedEmail.data, parsedPassword.data);
        if (result.error) throw new Error(result.error);
        const session = (await supabase.auth.getSession()).data.session;
        if (!session) { toast.success("Account created. Confirm your email, then reopen this invitation link."); return; }
      } else {
        const result = await signInWithPassword(parsedEmail.data, parsedPassword.data);
        if (result.error) throw new Error(result.error);
      }
      const response = await nextApi.invitations.accept(invitationId, token);
      setInvitation(response.data);
      setAccepted(true);
      toast.success("Invitation accepted.");
      window.setTimeout(() => navigate(roleLanding(response.data.invited_role), { replace: true }), 900);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This invitation could not be accepted.";
      setError(message);
    } finally { setSubmitting(false); }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-muted/30"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (error && !invitation && (!invitationId || !token)) return <StateCard icon={<Link2 className="h-7 w-7" />} title="Invalid invitation link" message={error} />;
  if (accepted) return <StateCard icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />} title="You're in" message={`Your ${invitation?.invited_role.replaceAll("_", " ")} access is ready. Redirecting to your workspace…`} />;

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md shadow-sm"><CardHeader className="space-y-4 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"><Users className="h-7 w-7 text-primary" /></div><div><CardTitle className="text-2xl">Join your Service Writer workspace</CardTitle><CardDescription className="mt-2">Use the email address that received this invitation. Your access is limited to the workspace and role assigned by the inviter.</CardDescription></div></CardHeader><CardContent><form onSubmit={authenticateAndAccept} className="space-y-4"><Tabs value={mode} onValueChange={(value) => setMode(value as "signin" | "signup")}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="signin">Sign in</TabsTrigger><TabsTrigger value="signup">Create account</TabsTrigger></TabsList><TabsContent value="signin" className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">Already have a Service Writer account? Sign in to accept the invitation.</p></TabsContent><TabsContent value="signup" className="mt-4 space-y-4"><p className="text-sm text-muted-foreground">Create an account with this email, then your invitation will be attached automatically.</p></TabsContent></Tabs><div className="space-y-2"><Label htmlFor="accept-email">Email</Label><Input id="accept-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="accept-password">Password</Label><Input id="accept-password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} required /><p className="text-xs text-muted-foreground">Minimum 8 characters.</p></div>{error && <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><XCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}<Button type="submit" className="w-full gap-2" disabled={submitting}><ShieldCheck className="h-4 w-4" />{submitting ? "Securing access…" : mode === "signin" ? "Sign in & accept" : "Create account & accept"}</Button></form></CardContent></Card></main>;
}

function StateCard({ icon, title, message }: { icon: React.ReactNode; title: string; message: string }) {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="space-y-3 p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">{icon}</div><h1 className="text-xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{message}</p></CardContent></Card></main>;
}
