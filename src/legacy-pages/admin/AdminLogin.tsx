import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import { logAuditEvent } from '@/lib/auditLog';
import { useNavigate } from "react-router-dom";
import { signInAdmin, checkAdminRole, signOut } from "@/application/queries/admin-login.query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Loader2, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate input
    const validation = loginSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    setLoading(true);

    try {
      // Sign in
      const { data: authData, error: authError } = await signInAdmin(email, password);

      let ip = '';
      try {
        // Try to get client IP (best effort, may be empty in browser)
        const res = await fetch('https://api.ipify.org?format=json');
        if (res.ok) {
          const data = await res.json();
          ip = data.ip;
        }
      } catch {
        // The audit log can omit the optional client IP when lookup fails.
      }

      if (authError || !authData.user) {
        await logAuditEvent({
          user_id: null,
          action: 'admin_login',
          status: 'failure',
          ip,
          details: { email, error: authError?.message || 'Authentication failed' },
        });
        throw authError || new Error('Authentication failed');
      }

      // Check if user has admin role
      const { data: roleData, error: roleError } = await checkAdminRole(authData.user.id);

      if (roleError || !roleData) {
        await signOut();
        await logAuditEvent({
          user_id: authData.user.id,
          action: 'admin_login',
          status: 'failure',
          ip,
          details: { email, error: roleError?.message || 'Not admin' },
        });
        throw roleError || new Error("Access denied. Admin privileges required.");
      }

      await logAuditEvent({
        user_id: authData.user.id,
        action: 'admin_login',
        status: 'success',
        ip,
        details: { email },
      });

      toast.success("Welcome, Admin!");
      navigate("/admin");
    } catch (err: unknown) {
      console.error("Admin login error:", err);
      setError(errorMessage(err, "Login failed"));
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-md bg-primary/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Admin Access</CardTitle>
          <CardDescription>
            Sign in with your administrator credentials
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign In
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              This area is restricted to platform administrators only
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;
