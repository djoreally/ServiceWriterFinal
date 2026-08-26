import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@packages/auth";
import { ChevronRight, LogIn, UserPlus } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { useQueryClient } from "@tanstack/react-query";
import { signInWithPassword, signUpWithEmail } from "@/application/commands/auth.command";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useStartupRoutingStore } from "@/stores/startupRoutingStore";
import { safeNextPath } from "@/lib/auth/next-path";
import { errorMessage } from "@/lib/error-message";
import { beginAuthInteraction } from "@/lib/authInteractionLock";

import { withOperationTimeout } from "@/lib/operation-timeout";
import { fetchWorkforceIdentity, selectActiveWorkspace, type WorkforceMembership } from "@/application/queries/workforce-identity.query";

type Intent = "login" | "signup";
type Variant = "default" | "business" | "dispatch" | "technician";

const VARIANT_COPY: Record<Variant, { title: string; description: string; badge: string }> = {
  default: {
    title: "Sign in to Service Writer",
    description: "Use the account your business invited or created. We'll open the right workspace for your role.",
    badge: "Workforce sign in",
  },
  business: {
    title: "Business Owner sign in",
    description: "For shop owners and admins managing your Service Writer workspace.",
    badge: "Business Owner",
  },
  dispatch: {
    title: "Dispatch & Office Staff sign in",
    description: "For dispatchers, managers, and front-desk staff running the daily board.",
    badge: "Dispatch / Office",
  },
  technician: {
    title: "Technician sign in",
    description: "For field technicians using the Service Writer tech app.",
    badge: "Technician",
  },
};

type WorkforceRole = WorkforceMembership["role"];

/** Which roles each login entry point is allowed to activate. */
const VARIANT_ROLES: Record<Variant, WorkforceRole[] | null> = {
  default: null, // generic/magic-link entry: any role
  business: ["admin", "owner"],
  dispatch: ["dispatcher", "manager", "fleet_manager"],
  technician: ["technician"],
};

/** Client-side source of truth for where each role lands. */
const ROLE_LANDING: Record<WorkforceRole, string> = {
  admin: "/dashboard",
  owner: "/dashboard",
  manager: "/dispatch",
  dispatcher: "/dispatch",
  fleet_manager: "/fleet-os",
  technician: "/tech-app",
};

const IDENTITY_RESOLUTION_TIMEOUT_MS = 10_000;
const DEMO_LOGIN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEMO_LOGIN === "true";
const DEMO_EMAIL = (process.env.NEXT_PUBLIC_DEMO_EMAIL || "demo@servicewriter.app").trim();
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || "";

/**
 * Where a signed-in user goes when workspace identity itself could not be read.
 * Credentials were already accepted at this point, so parking the user on a
 * dead-end card was the wrong call — the app shell re-resolves the role.
 */
const VARIANT_FALLBACK_LANDING: Record<Variant, string> = {
  default: "/dashboard",
  business: "/dashboard",
  dispatch: "/dispatch",
  technician: "/tech-app",
};

const landingPathFor = (membership: WorkforceMembership) =>
  ROLE_LANDING[membership.role] ?? membership.landingPath ?? "/dashboard";

const filterByVariant = (memberships: WorkforceMembership[], variant: Variant) => {
  const allowed = VARIANT_ROLES[variant];
  if (!allowed) return memberships;
  return memberships.filter((membership) => allowed.includes(membership.role));
};

export function WorkforceAuth({ intent, variant = "default" }: { intent: Intent; variant?: Variant }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // `?next=` lets flows such as the OAuth consent screen resume after sign-in.
  const nextPath = safeNextPath(searchParams.toString());
  const queryClient = useQueryClient();
  const { session, loading: authLoading } = useAuth();
  const setIntendedPath = useStartupRoutingStore((state) => state.setIntendedPath);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [memberships, setMemberships] = useState<WorkforceMembership[] | null>(null);
  const [roleMismatch, setRoleMismatch] = useState(false);

  const isSignup = intent === "signup";
  const copy = VARIANT_COPY[variant];
  const autoRouteRef = useRef(false);

  /**
   * Single source of truth for the post-sign-in destination: only memberships
   * matching the login entry point the user picked are eligible.
   */
  const routeIdentity = async () => {
    await withOperationTimeout(
      (async () => {
        const identity = await fetchWorkforceIdentity();
        const eligible = filterByVariant(identity, variant);

        if (eligible.length === 0) {
          setRoleMismatch(true);
          return;
        }
        if (eligible.length === 1) {
          await activateWorkspace(eligible[0]);
          return;
        }
        setMemberships(eligible);
      })(),
      IDENTITY_RESOLUTION_TIMEOUT_MS,
      "Workspace setup took too long to respond.",
    );
  };

  /**
   * Already-authenticated visitors (bookmark, browser back, page reload):
   * this page is the single routing authority on /login/* paths —
   * useStartupNavigation deliberately stays out of them, because the shell
   * resolved the role without the portal variant and raced this page,
   * bouncing dispatch/office staff into the technician app.
   */
  /**
   * Identity read failed *after* credentials were accepted. The session is
   * valid, so send the user into the app (the shell re-resolves the role) and
   * report the real backend message instead of blocking on a dead-end card.
   */
  const continueWithoutIdentity = (error: unknown) => {
    const destination = nextPath ?? VARIANT_FALLBACK_LANDING[variant];
    console.error("[workforce-auth] identity resolution failed", error);
    // Non-blocking: the app shell shows an inline retry banner (see
    // WorkspaceIdentityBanner), so this is a heads-up, not a dead end.
    toast.warning("Opening your workspace without a confirmed role", {
      description: errorMessage(error, "Retry from the banner if something looks off."),
    });
    setIntendedPath(destination);
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    if (isSignup || authLoading || !session || loading || autoRouteRef.current) return;
    autoRouteRef.current = true;
    setLoading(true);
    void routeIdentity()
      .catch(continueWithoutIdentity)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignup, authLoading, session, loading]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    // Hold off any deployment-sentinel reload until the credential exchange and
    // workspace routing finish (see src/lib/authInteractionLock.ts).
    const releaseAuthLock = beginAuthInteraction();
    try {
      if (isSignup) {
        const result = await signUpWithEmail(email, password);
        if (result.error) throw new Error(result.error);
        setIntendedPath("/plans");
        toast.success("Business account created. Choose a plan to continue.");
        navigate("/plans", { replace: true });
      } else {
        const result = await signInWithPassword(email, password);
        if (result.error) throw new Error(result.error);
        // Credentials are accepted from here on. Anything that fails below is a
        // backend availability problem, never an authentication failure.
        autoRouteRef.current = true;
        try {
          await routeIdentity();
        } catch (identityError) {
          continueWithoutIdentity(identityError);
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      releaseAuthLock();
      setLoading(false);
    }
  };



  const handleGoogleSignIn = async () => {
    setLoading(true);
    const releaseAuthLock = beginAuthInteraction();
    try {
      // Always an explicit, public, same-origin callback (never a protected
      // route): the current login page, carrying `next` when one was requested.
      const callback = new URL(window.location.pathname, window.location.origin);
      if (nextPath) callback.searchParams.set("next", nextPath);

      void callback;
      throw new Error("Google sign-in will be connected to the new backend during the authentication rebuild.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed");
    } finally {
      releaseAuthLock();
      setLoading(false);
    }

  };


  const activateWorkspace = async (membership: WorkforceMembership) => {
    const selected = await selectActiveWorkspace(membership.workspaceUserId, membership.role);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      queryClient.setQueryData<WorkforceMembership[]>(["workforce-identity", user.id], (current) => {
        const source = current?.length ? current : memberships ?? [membership];
        const exists = source.some((item) => item.workspaceUserId === selected.workspaceUserId && item.role === selected.role);
        const next = exists ? source : [selected, ...source];
        return next.map((item) => ({
          ...item,
          isDefault: item.workspaceUserId === selected.workspaceUserId && item.role === selected.role,
        }));
      });
    }
    navigate(nextPath ?? landingPathFor(selected), { replace: true });
  };

  const chooseWorkspace = async (membership: WorkforceMembership) => { setLoading(true); try { await withOperationTimeout(activateWorkspace(membership), IDENTITY_RESOLUTION_TIMEOUT_MS, "Workspace setup took too long to respond."); } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to select that workspace."); } finally { setLoading(false); } };
  

  if (roleMismatch) return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><CardTitle>Wrong sign-in for this account</CardTitle><CardDescription>This account isn't set up as {copy.badge}. Pick the option that matches your role and sign in there.</CardDescription></CardHeader><CardContent className="space-y-3"><Button className="w-full" onClick={() => navigate("/login")}>Choose a different role</Button><Button className="w-full" variant="outline" disabled={loading} onClick={() => { setRoleMismatch(false); void supabase.auth.signOut(); }}>Use a different account</Button></CardContent></Card></main>;
  if (memberships) return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><CardTitle>Choose a workspace</CardTitle><CardDescription>You belong to more than one workspace. Choose where you want to work.</CardDescription></CardHeader><CardContent className="space-y-3">{memberships.map((membership) => <Button key={`${membership.workspaceUserId}-${membership.role}`} className="h-auto w-full justify-between p-4 text-left" variant="outline" disabled={loading} onClick={() => void chooseWorkspace(membership)}><span><span className="block font-semibold">{membership.workspaceName}</span><span className="text-xs capitalize text-muted-foreground">{membership.role}</span></span><ChevronRight className="h-4 w-4" /></Button>)}</CardContent></Card></main>;
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><div className="mx-auto mb-2 inline-flex items-center justify-center rounded-md bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">{copy.badge}</div><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">{isSignup ? <UserPlus className="h-6 w-6" /> : <LogIn className="h-6 w-6" />}</div><CardTitle>{isSignup ? "Create your business account" : copy.title}</CardTitle><CardDescription>{isSignup ? "For business owners creating a new Service Writer workspace." : copy.description}</CardDescription></CardHeader><CardContent>{!isSignup && <><Button className="w-full" type="button" variant="outline" disabled={loading} onClick={handleGoogleSignIn}>Continue with Google</Button><div className="my-4 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs uppercase text-muted-foreground">or</span><div className="h-px flex-1 bg-border" /></div></>}{!isSignup && DEMO_LOGIN_ENABLED && DEMO_EMAIL && DEMO_PASSWORD && <Button className="mb-4 w-full" type="button" variant="secondary" disabled={loading} onClick={() => { setEmail(DEMO_EMAIL); setPassword(DEMO_PASSWORD); toast.info("Demo credentials loaded. Press Sign in to continue."); }}>Use demo credentials</Button>}<form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="workforce-email">Email</Label><Input id="workforce-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="space-y-2"><Label htmlFor="workforce-password">Password</Label><Input id="workforce-password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isSignup ? 6 : undefined} /></div><Button className="w-full" type="submit" disabled={loading}>{loading ? "Please wait…" : isSignup ? "Create account" : "Sign in"}</Button></form>{!isSignup && <div className="mt-3 flex items-center justify-between text-sm"><Link className="text-primary hover:underline" to="/login/magic-link">Email me a magic link</Link><Link className="text-primary hover:underline" to="/forgot-password">Forgot password?</Link></div>}<div className="mt-4 text-center text-xs text-muted-foreground"><Link to="/login" className="hover:underline">← Choose a different role</Link></div><div className="mt-6 border-t pt-4 text-center text-sm text-muted-foreground">{isSignup ? <>Already have an account? <Link className="font-medium text-primary" to="/login">Sign in</Link></> : <>New business owner? <Link className="font-medium text-primary" to="/signup">Create an account</Link></>}</div></CardContent></Card></main>;
}
