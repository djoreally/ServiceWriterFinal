/**
 * CalendarIntegration — Settings UI for Google Calendar sync.
 * Allows users to view connection status, connect via Google OAuth, and disconnect.
 */
import { errorMessage } from "@/lib/error-message";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CalendarDays,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Unplug,
  Loader2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";

import { GOOGLE_CALENDAR_REDIRECT_PATH, startGoogleCalendarOAuth } from "@/application/commands/google-calendar.command";
import { toast } from "@/components/ui/sonner";
import { hasGoogleOAuthConsentCookie, markGoogleOAuthConsentPrompted } from "@/lib/security/googleOAuthConsent";
import { formatDistanceToNow } from "date-fns";

export function CalendarIntegration() {
  const { status, loading, syncing, refreshStatus, runSyncNow, disconnect } = useGoogleCalendar();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  /** Initiate standalone Google OAuth (calendar authorization, not sign-in) */
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = window.location.origin + GOOGLE_CALENDAR_REDIRECT_PATH;
      sessionStorage.setItem("gcal_return_to", window.location.pathname);

      const { data, error } = await startGoogleCalendarOAuth(redirectUri);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const authorizationUrl = data?.authorization_url ?? data?.url;
      if (authorizationUrl) {
        markGoogleOAuthConsentPrompted();
        window.location.href = authorizationUrl;
        return;
      }
      throw new Error("Google did not return an authorization URL");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to connect Google Calendar"));
    } finally {
      setConnecting(false);
    }
  };


  const handleDisconnect = async () => {
    setDisconnecting(true);
    await disconnect();
    setDisconnecting(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="h-5 w-5 text-primary" />
          Google Calendar Sync
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Automatically push appointments to your Google Calendar
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status.connected && status.needsReauth ? (
              <Badge variant="destructive" className="gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Reconnect required
              </Badge>
            ) : status.connected ? (
              <Badge variant="default" className="gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" />
                Not Connected
              </Badge>
            )}
          </div>


          {status.connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshStatus}
              disabled={syncing}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          )}
        </div>

        {/* Sync Details (when connected) */}
        {status.connected && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Calendar</span>
                <span className="font-medium">{status.calendarId || "Primary"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Synced</span>
                <span className="font-medium">
                  {status.lastSyncAt
                    ? formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })
                    : "Never"}
                </span>
              </div>
              {status.connectedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Connected</span>
                  <span className="font-medium">
                    {formatDistanceToNow(new Date(status.connectedAt), { addSuffix: true })}
                  </span>
                </div>
              )}
            </div>

            {/* Expired / revoked authorization */}
            {status.needsReauth && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="text-xs font-medium text-destructive">
                    Google authorization expired — appointments are not syncing
                  </p>
                  <p className="mt-0.5 text-xs text-destructive/80">
                    Reconnect your Google account to resume calendar sync. Pending appointments are
                    pushed automatically once reconnected.
                  </p>
                </div>
              </div>
            )}

            {/* Sync Error */}
            {status.lastSyncError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-destructive">Last sync error</p>
                  <p className="text-xs text-destructive/80 mt-0.5">{status.lastSyncError}</p>
                </div>
              </div>
            )}

            <Separator />
          </>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {status.connected ? (
            <>
            <Button
              size="sm"
              onClick={status.needsReauth ? handleConnect : runSyncNow}
              disabled={syncing || connecting}
              className="gap-1.5"
            >
              {syncing || connecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {status.needsReauth ? "Reconnect Google Calendar" : "Run sync now"}
            </Button>

            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="gap-1.5"
            >
              {disconnecting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unplug className="h-3.5 w-3.5" />
              )}
              Disconnect
            </Button>
            </>
          ) : (
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="gap-2"
            >
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              Connect Google Calendar
            </Button>
          )}
        </div>

        {/* Info text */}
        <p className="text-xs text-muted-foreground">
          {status.connected
            ? "New appointments will be automatically synced to your Google Calendar."
            : "Connect your Google account to automatically push appointments to your calendar."}
        </p>
      </CardContent>
    </Card>
  );
}
