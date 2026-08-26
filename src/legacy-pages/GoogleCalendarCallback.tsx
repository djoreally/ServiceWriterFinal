import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { completeGoogleCalendarOAuth, GOOGLE_CALENDAR_REDIRECT_PATH } from "@/application/commands/google-calendar.command";
import { completeGoogleInsightsOAuth } from "@/application/commands/google-insights";

export default function GoogleCalendarCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const integration = sessionStorage.getItem("google_oauth_integration") || "calendar";
  const returnTo = sessionStorage.getItem("google_oauth_return_to") || sessionStorage.getItem("gcal_return_to") || "/settings";

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const code = params.get("code");
    const state = params.get("state");
    const oauthError = params.get("error");
    void (async () => {
      if (oauthError || !code) return setError(oauthError || "Google did not return an authorization code.");
      try {
        const redirectUri = window.location.origin + GOOGLE_CALENDAR_REDIRECT_PATH;
        if (integration === "insights") {
          if (!state) throw new Error("Google did not return a secure authorization state.");
          await completeGoogleInsightsOAuth(code, state, redirectUri);
          toast.success("Google Analytics and Business Profile authorized");
        } else {
          if (!state) throw new Error("Google did not return a secure authorization state.");
          const { data, error: fnError } = await completeGoogleCalendarOAuth(code, state, redirectUri);
          if (fnError) throw fnError;
          if (data?.error) throw new Error(data.error);
          const pushed = data?.backfill?.pushed ?? 0;
          toast.success(pushed ? `Google Calendar connected — ${pushed} appointment${pushed === 1 ? "" : "s"} synced` : "Google Calendar connected");
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

  if (error) return <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"><AlertTriangle className="h-8 w-8 text-destructive" /><h1 className="text-lg font-semibold">Could not connect Google</h1><p className="max-w-md text-sm text-muted-foreground">{error}</p><Button onClick={() => navigate(returnTo, { replace: true })}>Go back</Button></div>;
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><p className="text-sm text-muted-foreground">Connecting Google…</p></div>;
}
