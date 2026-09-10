import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";
import {
  completeGoogleCalendarOAuth,
  exchangeGoogleTokens,
  GOOGLE_CALENDAR_REDIRECT_PATH,
  runGoogleCalendarBackfill,
} from "@/application/commands/google-calendar.command";
import { completeGoogleInsightsOAuth } from "@/application/commands/google-insights";
import { supabase } from "@/integrations/supabase/client";

export default function GoogleCalendarCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const integration = sessionStorage.getItem("google_oauth_integration") || "calendar";
  const returnTo = sessionStorage.getItem("google_oauth_return_to") || sessionStorage.getItem("gcal_return_to") || "/settings?tab=integrations";

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const oauthError = params.get("error") || params.get("error_description");
        if (oauthError) throw new Error(oauthError);

        // Calendar authorization now uses the Google provider already configured
        // in Supabase Auth. After the provider round-trip Supabase owns the OAuth
        // exchange and exposes Google's provider token on the restored session.
        if (integration === "calendar") {
          let session = (await supabase.auth.getSession()).data.session;

          // Give detectSessionInUrl/onAuthStateChange one short turn to hydrate the
          // OAuth result before considering the legacy direct callback fallback.
          if (!session?.provider_token) {
            await new Promise((resolve) => setTimeout(resolve, 250));
            session = (await supabase.auth.getSession()).data.session;
          }

          if (session?.provider_token) {
            await exchangeGoogleTokens(session.provider_token, session.provider_refresh_token ?? null);
            const { data: backfill } = await runGoogleCalendarBackfill();
            const pushed = backfill?.pushed ?? 0;
            toast.success(pushed ? `Google Calendar connected — ${pushed} appointment${pushed === 1 ? "" : "s"} synced` : "Google Calendar connected");
          } else {
            // Support any older direct-Google consent URL that was already open
            // before this release landed.
            const code = params.get("code");
            const state = params.get("state");
            if (!code || !state) throw new Error("Google authorization completed without a provider token. Please connect again.");
            const redirectUri = window.location.origin + GOOGLE_CALENDAR_REDIRECT_PATH;
            const { data } = await completeGoogleCalendarOAuth(code, state, redirectUri);
            const pushed = data?.backfill?.pushed ?? 0;
            toast.success(pushed ? `Google Calendar connected — ${pushed} appointment${pushed === 1 ? "" : "s"} synced` : "Google Calendar connected");
          }
        } else {
          const code = params.get("code");
          const state = params.get("state");
          if (!code || !state) throw new Error("Google did not return a secure authorization response.");
          const redirectUri = window.location.origin + GOOGLE_CALENDAR_REDIRECT_PATH;
          await completeGoogleInsightsOAuth(code, state, redirectUri);
          toast.success("Google Analytics and Business Profile authorized");
        }

        sessionStorage.removeItem("google_oauth_integration");
        sessionStorage.removeItem("google_oauth_return_to");
        sessionStorage.removeItem("gcal_return_to");
        navigate(returnTo, { replace: true });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to complete Google authorization");
      }
    })();
  }, [integration, navigate, params, returnTo]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <h1 className="text-lg font-semibold">Could not connect Google</h1>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => navigate(returnTo, { replace: true })}>Go back</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Connecting Google…</p>
    </div>
  );
}
