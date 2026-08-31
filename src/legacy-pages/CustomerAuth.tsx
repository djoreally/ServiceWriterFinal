import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getAuthUser,
  checkCustomerAccount,
  onAuthStateChange,
} from "@/application/queries/customer-auth.query";
import {
  signInCustomer,
  signUpCustomer,
  createCustomerAccount,
  resetPassword,
} from "@/application/commands/customer-auth.command";
import { beginAuthInteraction } from "@/lib/authInteractionLock";

import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { toast } from "@/components/ui/sonner";
import { Loader2, User, Lock, Phone, Mail, KeyRound, ArrowLeft } from "lucide-react";
import { z } from "zod";

// ── Illustrations (defined at module level to avoid re-creation on each render) ──

function LoginIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Road */}
      <rect x="20" y="100" width="160" height="8" rx="4" fill="#e2e8f0"/>
      {/* Car body */}
      <rect x="55" y="72" width="90" height="32" rx="8" fill="#1e293b"/>
      {/* Car roof */}
      <path d="M70 72 L85 50 L115 50 L130 72Z" fill="#334155"/>
      {/* Windows */}
      <rect x="88" y="54" width="24" height="16" rx="3" fill="#7dd3fc"/>
      {/* Wheels */}
      <circle cx="75" cy="104" r="10" fill="#475569"/>
      <circle cx="75" cy="104" r="5" fill="#94a3b8"/>
      <circle cx="125" cy="104" r="10" fill="#475569"/>
      <circle cx="125" cy="104" r="5" fill="#94a3b8"/>
      {/* Person */}
      <circle cx="155" cy="52" r="12" fill="#fbbf24"/>
      <path d="M143 80 Q155 68 167 80 L169 100 H141 Z" fill="#1e293b"/>
      {/* Location pin */}
      <path d="M155 20 C150 20 146 24 146 29 C146 36 155 44 155 44 C155 44 164 36 164 29 C164 24 160 20 155 20Z" fill="#ef4444"/>
      <circle cx="155" cy="29" r="4" fill="white"/>
    </svg>
  );
}

function RegisterIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Clipboard */}
      <rect x="65" y="30" width="70" height="90" rx="6" fill="#e2e8f0"/>
      <rect x="80" y="24" width="40" height="14" rx="4" fill="#cbd5e1"/>
      {/* Lines */}
      <rect x="75" y="55" width="50" height="4" rx="2" fill="#94a3b8"/>
      <rect x="75" y="67" width="38" height="4" rx="2" fill="#94a3b8"/>
      <rect x="75" y="79" width="44" height="4" rx="2" fill="#94a3b8"/>
      <rect x="75" y="91" width="30" height="4" rx="2" fill="#94a3b8"/>
      {/* Check mark circle */}
      <circle cx="148" cy="95" r="20" fill="#1e293b"/>
      <path d="M138 95 L145 102 L158 88" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Person */}
      <circle cx="45" cy="55" r="14" fill="#fbbf24"/>
      <path d="M30 90 Q45 75 60 90 L63 115 H27 Z" fill="#1e293b"/>
    </svg>
  );
}

function ResetIllustration() {
  return (
    <svg viewBox="0 0 200 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="100" cy="70" r="40" fill="#e2e8f0"/>
      <path d="M84 70 A16 16 0 1 1 100 86" stroke="#1e293b" strokeWidth="4" strokeLinecap="round"/>
      <path d="M84 70 L78 64 M84 70 L78 76" stroke="#1e293b" strokeWidth="4" strokeLinecap="round"/>
      <rect x="90" y="58" width="20" height="14" rx="3" fill="#475569"/>
      <rect x="87" y="70" width="26" height="20" rx="3" fill="#334155"/>
      <circle cx="100" cy="80" r="3" fill="#7dd3fc"/>
    </svg>
  );
}

const emailSchema = z.string().email("Please enter a valid email address");
const passwordSchema = z.string().min(6, "Password must be at least 6 characters");

interface CustomerAuthProps {
  providerId?: string;
  providerName?: string;
  onSuccess?: () => void;
  returnPath?: string;
}

export default function CustomerAuth({ providerId, providerName, onSuccess, returnPath }: CustomerAuthProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = returnPath || searchParams.get("returnTo");
  const providerIdParam = providerId || searchParams.get("provider");
  
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<"login" | "signup" | "reset">("login");
  
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupPhone, setSignupPhone] = useState("");
  
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    // Check if already logged in as customer
    const checkAuth = async () => {
      const user = await getAuthUser();
      if (user) {
        const hasAccount = await checkCustomerAccount(user.id);
        if (hasAccount) {
          if (onSuccess) {
            onSuccess();
          } else {
            navigate(returnTo || "/customer/dashboard");
          }
          return;
        }
      }
      setCheckingAuth(false);
    };
    
    // Set up auth state listener
    const { data: { subscription } } = onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setTimeout(() => {
            if (onSuccess) {
              onSuccess();
            } else {
              navigate(returnTo || "/customer/dashboard");
            }
          }, 0);
        }
      }
    );
    
    checkAuth();
    
    return () => subscription.unsubscribe();
  }, [navigate, onSuccess, returnTo]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0].message);
        return;
      }
    }
    
    setLoading(true);
    // Block any deployment-sentinel reload while credentials are exchanged.
    const releaseAuthLock = beginAuthInteraction();
    try {
      const { data, error } = await signInCustomer(loginEmail, loginPassword);

      if (error) throw error;

      // Check if this user has a customer account
      const hasAccount = await checkCustomerAccount(data.user.id);

      if (!hasAccount) {
        await createCustomerAccount(data.user.id, loginEmail, undefined, undefined, providerIdParam);
      }

      toast.success("Welcome back!");
      if (onSuccess) {
        onSuccess();
      } else {
        navigate(returnTo || "/customer/dashboard");
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes("Invalid login credentials")) {
        toast.error("Invalid email or password");
      } else {
        toast.error(err.message || "Login failed");
      }
    } finally {
      releaseAuthLock();
      setLoading(false);
    }

  };
  
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(resetEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0].message);
        return;
      }
    }
    
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/customer/auth?reset=true`;
      
      const { error } = await resetPassword(resetEmail, redirectUrl);

      if (error) throw error;

      setResetSent(true);
      toast.success("Password reset email sent! Check your inbox.");
    } catch (error: unknown) {
      const err = error as Error;
      toast.error(err.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0].message);
        return;
      }
    }
    
    if (!signupName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    
    setLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/customer/dashboard`;
      
      const { data, error } = await signUpCustomer(
        signupEmail,
        signupPassword,
        signupName,
        signupPhone,
        redirectUrl,
      );

      if (error) throw error;

      if (data.user) {
        // Create customer account, link to provider if provided
        await createCustomerAccount(
          data.user.id,
          signupEmail,
          signupName,
          signupPhone || undefined,
          providerIdParam,
        );

        toast.success("Account created! Check your email to confirm.");
        if (onSuccess) {
          onSuccess();
        } else {
          navigate(returnTo || "/customer/dashboard");
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes("already registered")) {
        toast.error("This email is already registered. Please login instead.");
        setActiveTab("login");
        setLoginEmail(signupEmail);
      } else {
        toast.error(err.message || "Signup failed");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-700" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background circles */}
      <div className="absolute top-[-80px] right-[-80px] w-64 h-64 rounded-md bg-slate-300/40 pointer-events-none" />
      <div className="absolute bottom-[-60px] left-[-60px] w-48 h-48 rounded-md bg-slate-200/60 pointer-events-none" />
      <div className="absolute top-[30%] left-[-40px] w-24 h-24 rounded-md bg-slate-300/30 pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">

        {/* ── RESET PASSWORD ── */}
        {activeTab === "reset" && (
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
            <div className="h-32 mx-auto w-48">
              <ResetIllustration />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-800">Reset Password</h1>
              <p className="text-sm text-slate-400 mt-1">
                Enter your email to receive a reset link
              </p>
            </div>

            {resetSent ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center">
                  <KeyRound className="h-6 w-6 text-gray-600" />
                </div>
                <p className="text-sm text-slate-600">
                  We've sent a reset link to <strong>{resetEmail}</strong>
                </p>
                <Button
                  className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                  onClick={() => { setActiveTab("login"); setResetSent(false); }}
                >
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <IconInput
                  id="reset-email"
                  icon={Mail}
                  type="email"
                  placeholder="your@email.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  disabled={loading}
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Send Reset Link
                </Button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mx-auto"
                  onClick={() => setActiveTab("login")}
                >
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── LOGIN ── */}
        {activeTab === "login" && (
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
            <div className="h-32 mx-auto w-48">
              <LoginIllustration />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-800">Login</h1>
              <p className="text-sm text-slate-400 mt-1">
                {providerName ? `${providerName} – Please Sign In to continue` : "Please Sign In to continue"}
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <IconInput
                id="login-email"
                icon={Mail}
                type="email"
                placeholder="Email address"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                disabled={loading}
              />
              <IconInput
                id="login-password"
                icon={Lock}
                type="password"
                placeholder="Password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                disabled={loading}
              />

              <div className="text-right">
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
                  onClick={() => { setActiveTab("reset"); setResetEmail(loginEmail); }}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Sign In
              </Button>
            </form>

            <p className="text-center text-sm text-slate-500">
              Don't have an account?{" "}
              <button
                type="button"
                className="font-semibold text-slate-800 hover:underline"
                onClick={() => setActiveTab("signup")}
              >
                Sign Up
              </button>
            </p>
          </div>
        )}

        {/* ── REGISTER ── */}
        {activeTab === "signup" && (
          <div className="bg-white rounded-3xl shadow-xl p-8 space-y-6">
            <div className="h-32 mx-auto w-48">
              <RegisterIllustration />
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-800">Register</h1>
              <p className="text-sm text-slate-400 mt-1">Please register to continue</p>
            </div>

            <form onSubmit={handleSignup} className="space-y-4">
              <IconInput
                id="signup-name"
                icon={User}
                placeholder="Full Name"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                required
                disabled={loading}
              />
              <IconInput
                id="signup-phone"
                icon={Phone}
                type="tel"
                placeholder="Phone number (optional)"
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                disabled={loading}
              />
              <IconInput
                id="signup-email"
                icon={Mail}
                type="email"
                placeholder="Email address"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
                disabled={loading}
              />
              <IconInput
                id="signup-password"
                icon={Lock}
                type="password"
                placeholder="Password (min. 6 characters)"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
                disabled={loading}
              />

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Sign Up
              </Button>

              <p className="text-xs text-slate-400 text-center">
                Creating an account links any previous bookings made with this email.
              </p>
            </form>

            <p className="text-center text-sm text-slate-500">
              Already have an account?{" "}
              <button
                type="button"
                className="font-semibold text-slate-800 hover:underline"
                onClick={() => setActiveTab("login")}
              >
                Sign In
              </button>
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
