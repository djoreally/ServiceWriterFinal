import { useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/application/commands/auth.command";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email);
      // Keep this response generic so the page cannot be used to enumerate accounts.
      setSubmitted(true);
    } catch {
      toast.error("We could not start the password reset. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardHeader className="text-center"><KeyRound className="mx-auto mb-4 h-10 w-10 text-primary" /><CardTitle>Reset your password</CardTitle><CardDescription>{submitted ? "If an account matches that email, a reset link is on its way." : "Enter your account email and we'll send a secure reset link."}</CardDescription></CardHeader><CardContent>{submitted ? <Button className="w-full" asChild><Link to="/login">Back to sign in</Link></Button> : <form onSubmit={submit} className="space-y-4"><div className="space-y-2"><Label htmlFor="reset-email">Email</Label><Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div><Button className="w-full" type="submit" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button><p className="text-center text-sm text-muted-foreground"><Link className="text-primary" to="/login">Back to sign in</Link></p></form>}</CardContent></Card></main>;
}
