/**
 * CalendarIntegration — Settings UI for Google Calendar sync.
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
  AlertTriangle,
} from "lucide-react";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";
import { GOOGLE_CALENDAR_REDIRECT_PATH, startGoogleCalendarOAuth } from "@/application/commands/google-calendar.command";
import { toast } from "@/components/ui/sonner";
import { markGoogleOAuthConsentPrompted } from "@/lib/security/googleOAuthConsent";
import { formatDistanceToNow } from "date-fns";

export function CalendarIntegration() {
  const { status, loading, syncing, refreshStatus, runSyncNow, disconnect } = useGoogleCalendar();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const redirectUri = window.location.origin + GOOGLE_CALENDAR_REDIRECT_PATH;
      sessionStorage.setItem("google_oauth_integration", "calendar");
      sessionStorage.setItem("google_oauth_return_to", window.location.pathname + window.location.search);
      sessionStorage.setItem("gcal_return_to", window.location.pathname + window.location.search);

      const { data } = await startGoogleCalendarOAuth(redirectUri);
      if (data?.connected) {
        toast.success("Google Calendar connected");
        await refreshStatus();
        return;
      }

      const authorizationUrl = data?.authorization_url ?? data?.url;
      if (!authorizationUrl) throw new Error("Google did not return an authorization URL");
      markGoogleOAuthConsentPrompted();
      window.location.assign(authorizationUrl);
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to connect Google Calendar"));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setDisconnecting(false);
    }
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
        <p className="text-sm text-muted-foreground">Automatically push appointments to your Google Calendar</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status.connected && status.needsReauth ? (
              <Badge variant="destructive" className="gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Reconnect required</Badge>
            ) : status.connected ? (
              <Badge variant="default" className="gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />Connected</Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5"><XCircle className="h-3.5 w-3.5" />Not Connected</Badge>
            )}
          </div>
          {status.connected && (
            <Button variant="ghost" size="sm" onClick={refreshStatus} disabled={syncing} className="gap-1.5 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />Refresh
            </Button>
          )}
        </div>

        {status.connected && (
          <>
            <Separator />
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Calendar</span><span className="font-medium">{status.calendarId || "Primary"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Synced</span><span className="font-medium">{status.lastSyncAt ? formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true }) : "Never"}</span></div>
              {status.connectedAt && <div className="flex justify-between"><span className="text-muted-foreground">Connected</span><span className="font-medium">{formatDistanceToNow(new Date(status.connectedAt), { addSuffix: true })}</span></div>}
            </div>
            {status.needsReauth && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div><p className="text-xs font-medium text-destructive">Google authorization expired — appointments are not syncing</p><p className="mt-0.5 text-xs text-destructive/80">Reconnect your Google account to resume calendar sync.</p></div>
              </div>
            )}
            {status.lastSyncError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div><p className="text-xs font-medium text-destructive">Last sync error</p><p className="text-xs text-destructive/80 mt-0.5">{status.lastSyncError}</p></div>
              </div>
            )}
            <Separator />
          </>
        )}

        <div className="flex gap-2">
          {status.connected ? (
            <>
              <Button size="sm" onClick={status.needsReauth ? handleConnect : runSyncNow} disabled={syncing || connecting} className="gap-1.5">
                {syncing || connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {status.needsReauth ? "Reconnect Google Calendar" : "Run sync now"}
              </Button>
              <Button variant="destructive" size="sm" onClick={handleDisconnect} disabled={disconnecting} className="gap-1.5">
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={handleConnect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
              Connect Google Calendar
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{status.connected ? "New appointments will be automatically synced to your Google Calendar." : "Connect your Google account to automatically push appointments to your calendar."}</p>
      </CardContent>
    </Card>
  );
}
