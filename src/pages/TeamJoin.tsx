/**
 * TeamJoin - Invitation acceptance page for new team members
 * 
 * Flow:
 * 1. Team member clicks invitation link with token
 * 2. Shows invitation details (business name, role)
 * 3. Creates account (sign up) or signs in
 * 4. Accepts invitation via RPC, linking auth account to technician record
 * 5. Redirects to team member dashboard
 */

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTeamInvitation,
  acceptTeamInvitation,
  signUpForTeam,
  signInForTeam,
  getSession,
  buildTeamJoinRedirectUrl,
} from "@/application/queries/team-join.query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface InvitationInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  business_name: string;
  expires_at: string;
}

const landingPathForRole = (role: string) => {
  const normalized = role.toLowerCase();
  if (normalized === "technician") return "/tech-app";
  if (normalized === "dispatcher") return "/dispatch";
  return "/dashboard";
};

const TeamJoin = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [autoAcceptAttempted, setAutoAcceptAttempted] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("No invitation token provided");
      setLoading(false);
      return;
    }

    const fetchInvitation = async () => {
      try {
        const { data, error: fetchError } = await fetchTeamInvitation(token);

        if (fetchError || !data || (Array.isArray(data) && data.length === 0)) {
          console.error("[TeamJoin] Fetch error:", fetchError);
          setError("Invalid or expired invitation");
          setLoading(false);
          return;
        }

        const inv = Array.isArray(data) ? data[0] : data;
        if (inv.status !== "pending") {
          const message = inv.status === "accepted"
            ? "This invitation has already been accepted. Sign in to continue."
            : inv.status === "revoked"
              ? "This invitation was revoked. Ask your manager to send a new invitation."
              : "This invitation is no longer valid. Ask your manager to send a new invitation.";
          setError(message);
          setLoading(false);
          return;
        }

        if (new Date(inv.expires_at) < new Date()) {
          setError("This invitation has expired");
          setLoading(false);
          return;
        }

        setInvitation(inv as InvitationInfo);
        setEmail(inv.email);
      } catch (err) {
        console.error("[TeamJoin] Unexpected error:", err);
        setError("Failed to load invitation. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchInvitation();
  }, [token]);

  const acceptInvitation = async () => {
    if (!token) return;

    const { data, error: rpcError } = await acceptTeamInvitation(token);

    if (rpcError) {
      toast.error("Failed to accept invitation: " + rpcError.message);
      return false;
    }

    const result = typeof data === "string" ? JSON.parse(data) : data;
    if (!result.success) {
      toast.error(result.error || "Failed to accept invitation");
      return false;
    }

    void supabase.rpc("record_auth_security_event_v1", { p_event_type: "invite_accepted" });
    return true;
  };

  useEffect(() => {
    if (!invitation || !token || accepted || autoAcceptAttempted) {
      return;
    }

    setAutoAcceptAttempted(true);

    (async () => {
      const { data: { session } } = await getSession();
      if (!session) {
        return;
      }

      const success = await acceptInvitation();
      if (success) {
        setAccepted(true);
        toast.success("Invitation accepted! Redirecting...");
        setTimeout(() => navigate(landingPathForRole(invitation.role)), 1500);
      }
    })().catch((err) => {
      console.error("[TeamJoin] Auto-accept failed:", err);
    });
  }, [invitation, token, accepted, autoAcceptAttempted, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = buildTeamJoinRedirectUrl(origin, token);

    const { error: signUpError } = await signUpForTeam(
      email,
      password,
      redirectTo,
    );

    if (signUpError) {
      toast.error(signUpError.message);
      setFormLoading(false);
      return;
    }

    // Try to accept immediately (if auto-confirm is on) or show success
    const { data: { session } } = await getSession();
    if (session) {
      const success = await acceptInvitation();
      if (success) {
        setAccepted(true);
        toast.success("Welcome to the team! Redirecting...");
        setTimeout(() => navigate(landingPathForRole(invitation.role)), 1500);
      }
    } else {
      toast.success("Account created! Check your email to verify. You will return here to finish joining the team.");
    }
    setFormLoading(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);

    const { error: signInError } = await signInForTeam(email, password);

    if (signInError) {
      toast.error(signInError.message);
      setFormLoading(false);
      return;
    }

    const success = await acceptInvitation();
    if (success) {
      setAccepted(true);
      toast.success("Invitation accepted! Redirecting...");
      setTimeout(() => navigate(landingPathForRole(invitation.role)), 1500);
    }
    setFormLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Invitation Error</h2>
            <p className="text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-gray-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Welcome to the Team!</h2>
            <p className="text-muted-foreground">Redirecting to your dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <div className="h-16 w-16 rounded-md bg-primary/10 flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Join {invitation?.business_name || "the Team"}</CardTitle>
          <CardDescription>
            You've been invited as a <Badge variant="secondary">{invitation?.role?.replace("_", " ")}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signup" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signup">Create Account</TabsTrigger>
              <TabsTrigger value="signin">Sign In</TabsTrigger>
            </TabsList>

            <TabsContent value="signup" className="pt-4">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    disabled
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the email your invitation was sent to
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Password (min. 6 characters)</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading ? "Creating account..." : "Create Account & Join"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signin" className="pt-4">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={formLoading}>
                  {formLoading ? "Signing in..." : "Sign In & Accept"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TeamJoin;
