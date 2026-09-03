import { useEffect, useState } from "react";
import { Link2, Loader2, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function TeamJoin() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("This invitation link is incomplete.");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/invitations/resolve?token=${encodeURIComponent(token)}`, {
          headers: { Accept: "application/json" },
        });
        const payload = await response.json().catch(() => null) as { data?: { invitation_id?: string }; error?: { message?: string } } | null;
        if (!response.ok || !payload?.data?.invitation_id) {
          throw new Error(payload?.error?.message || "This invitation link is invalid or expired.");
        }
        if (!cancelled) {
          navigate(`/team/join?invitation_id=${encodeURIComponent(payload.data.invitation_id)}&token=${encodeURIComponent(token)}`, { replace: true });
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "This invitation link is invalid or expired.");
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, token]);

  if (!error) {
    return <main className="flex min-h-screen items-center justify-center bg-muted/30"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Opening your invitation…</p></div></main>;
  }

  return <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4"><Card className="w-full max-w-md"><CardContent className="space-y-4 p-6 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">{error ? <XCircle className="h-6 w-6 text-destructive" /> : <Link2 className="h-6 w-6" />}</div><h1 className="text-xl font-semibold">Invitation unavailable</h1><p className="text-sm text-muted-foreground">{error}</p><Button type="button" onClick={() => navigate("/login", { replace: true })}>Go to sign in</Button></CardContent></Card></main>;
}
