import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  disconnectGoogleInsights,
  fetchGoogleAnalyticsOverview,
  fetchGoogleInsightsResources,
  fetchGoogleInsightsStatus,
  GOOGLE_INSIGHTS_REDIRECT_PATH,
  selectGoogleInsightsResources,
  startGoogleInsightsOAuth,
  type GoogleAnalyticsOverview,
  type GoogleInsightsResources,
  type GoogleInsightsStatus,
} from "@/application/commands/google-insights";

export function GoogleInsightsConnections() {
  const [status, setStatus] = useState<GoogleInsightsStatus | null>(null);
  const [resources, setResources] = useState<GoogleInsightsResources | null>(null);
  const [overview, setOverview] = useState<GoogleAnalyticsOverview | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [working, setWorking] = useState(false);

  const load = async () => {
    const next = await fetchGoogleInsightsStatus();
    setStatus(next);
    setPropertyId(next.analytics_property_id || "");
    if (!next.connected) {
      setResources(null);
      setOverview(null);
      return;
    }
    setResources(await fetchGoogleInsightsResources());
    if (next.analytics_property_id) {
      setOverview(await fetchGoogleAnalyticsOverview(30));
    } else {
      setOverview(null);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => load().catch(() => setStatus({ connected: false })));
  }, []);

  const connect = async () => {
    setWorking(true);
    try {
      const data = await startGoogleInsightsOAuth(window.location.origin + GOOGLE_INSIGHTS_REDIRECT_PATH);
      sessionStorage.setItem("google_oauth_integration", "insights");
      sessionStorage.setItem("google_oauth_return_to", "/reports");
      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to connect Google Analytics");
      setWorking(false);
    }
  };

  const save = async () => {
    setWorking(true);
    try {
      await selectGoogleInsightsResources(propertyId || null, null);
      await load();
      toast.success("Google Analytics property saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save Google Analytics property");
    } finally {
      setWorking(false);
    }
  };

  const disconnect = async () => {
    setWorking(true);
    try {
      await disconnectGoogleInsights();
      setStatus({ connected: false });
      setResources(null);
      setOverview(null);
      toast.success("Google Analytics disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to disconnect Google Analytics");
    } finally {
      setWorking(false);
    }
  };

  if (!status) {
    return <Card><CardContent className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Google Analytics</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">Connect this workspace to a GA4 property using read-only Google Analytics access.</p>
          <Button onClick={connect} disabled={working}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Connect Google Analytics</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Google Analytics connected</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <label className="block text-sm font-medium">GA4 property
          <select className="mt-1 block h-10 w-full rounded-md border bg-background px-3 font-normal" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}>
            <option value="">Choose a property</option>
            {resources?.analytics.map((property) => <option key={property.id} value={property.id}>{property.name} — {property.account}</option>)}
          </select>
        </label>

        {overview && (
          <div>
            <div className="mb-2 text-xs text-muted-foreground">Last 30 days · {overview.property_name || `Property ${overview.property_id}`}</div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Active users</div><div className="text-2xl font-semibold">{overview.totals.activeUsers.toLocaleString()}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Sessions</div><div className="text-2xl font-semibold">{overview.totals.sessions.toLocaleString()}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">New users</div><div className="text-2xl font-semibold">{overview.totals.newUsers.toLocaleString()}</div></div>
              <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Key events</div><div className="text-2xl font-semibold">{overview.totals.conversions.toLocaleString()}</div></div>
            </div>
          </div>
        )}

        {resources?.errors && Object.keys(resources.errors).length > 0 && (
          <div className="space-y-1 rounded-md border border-destructive/20 bg-destructive/10 p-3">
            {Object.entries(resources.errors).map(([source, message]) => <p key={source} className="text-xs text-destructive"><span className="font-semibold capitalize">{source}</span> — Google says: {message}</p>)}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={working || !propertyId}>Save property</Button>
          <Button variant="outline" onClick={() => void load()} disabled={working}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button variant="ghost" className="text-destructive" onClick={disconnect} disabled={working}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
        </div>
      </CardContent>
    </Card>
  );
}
