/**
 * OAuth 2.1 consent screen — routed at /.lovable/oauth/consent
 *
 * The backend authorization server redirects here with ?authorization_id=...
 * when an MCP client (ChatGPT, Claude, Lovable, Cursor…) asks to act as this
 * user. Approving returns the client to its redirect URL with an auth code.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  approveOAuthAuthorization,
  denyOAuthAuthorization,
  getOAuthAuthorizationDetails,
  getOAuthSession,
  type AuthorizationDetails,
} from "@/application/commands/oauth-consent.command";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!authorizationId) {
        setError("Missing authorization_id — this link is incomplete.");
        return;
      }
      const { data: sess } = await getOAuthSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = `/login?next=${encodeURIComponent(next)}`;
        return;
      }
      const { data, error: detailsError } = await getOAuthAuthorizationDetails(authorizationId);
      if (!active) return;
      if (detailsError) {
        setError(detailsError.message);
        return;
      }
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error: decideError } = approve
      ? await approveOAuthAuthorization(authorizationId)
      : await denyOAuthAuthorization(authorizationId);
    if (decideError) {
      setBusy(false);
      setError(decideError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("No redirect returned by the authorization server. Restart the connection from the client app.");
      return;
    }
    window.location.href = target;
  };

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Could not load this request</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" onClick={() => (window.location.href = "/dashboard")}>
              Back to ServiceWriter
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!details) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">Loading connection request…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect {clientName} to ServiceWriter</CardTitle>
          <CardDescription>
            {clientName} is asking to use ServiceWriter as you. It will be able to read your appointments, customers,
            vehicle service history, and service catalog, and create customers on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" disabled={busy} onClick={() => void decide(true)}>
            {busy ? "Working…" : "Approve"}
          </Button>
          <Button className="w-full" variant="outline" disabled={busy} onClick={() => void decide(false)}>
            Deny
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
