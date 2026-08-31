import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { disconnectGoogleInsights, fetchGoogleInsightsResources, fetchGoogleInsightsStatus, GOOGLE_INSIGHTS_REDIRECT_PATH, selectGoogleInsightsResources, startGoogleInsightsOAuth, type GoogleInsightsResources, type GoogleInsightsStatus } from "@/application/commands/google-insights";

export function GoogleInsightsConnections() {
  const [status, setStatus] = useState<GoogleInsightsStatus | null>(null);
  const [resources, setResources] = useState<GoogleInsightsResources | null>(null);
  const [propertyId, setPropertyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [working, setWorking] = useState(false);

  const load = async () => {
    const next = await fetchGoogleInsightsStatus();
    setStatus(next);
    setPropertyId(next.analytics_property_id || "");
    setLocationId(next.business_location_id || "");
    if (next.connected) setResources(await fetchGoogleInsightsResources());
  };
  useEffect(() => { void Promise.resolve().then(() => load().catch(() => setStatus({ connected: false }))); }, []);

  const connect = async () => {
    setWorking(true);
    try {
      const data = await startGoogleInsightsOAuth(window.location.origin + GOOGLE_INSIGHTS_REDIRECT_PATH);
      sessionStorage.setItem("google_oauth_integration", "insights");
      sessionStorage.setItem("google_oauth_return_to", "/reports");
      window.location.href = data.url;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to connect Google"); setWorking(false); }
  };
  const save = async () => {
    setWorking(true);
    try { await selectGoogleInsightsResources(propertyId || null, locationId || null); await load(); toast.success("Google reporting sources saved"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to save Google sources"); }
    finally { setWorking(false); }
  };
  const disconnect = async () => {
    setWorking(true);
    try { await disconnectGoogleInsights(); setStatus({ connected: false }); setResources(null); toast.success("Google reporting disconnected"); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Unable to disconnect Google"); }
    finally { setWorking(false); }
  };

  if (!status) return <Card><CardContent className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>;
  if (!status.connected) return <Card><CardHeader><CardTitle className="text-base">Google Analytics & Business Profile</CardTitle></CardHeader><CardContent><p className="mb-4 text-sm text-muted-foreground">Authorize read-only Analytics reporting and Business Profile performance using your existing Google OAuth application.</p><Button onClick={connect} disabled={working}>{working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Connect Google reporting</Button></CardContent></Card>;

  return <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="h-5 w-5 text-emerald-600" />Google reporting connected</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-medium">Analytics property<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3 font-normal" value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">No property selected</option>{resources?.analytics.map((property) => <option key={property.id} value={property.id}>{property.name} — {property.account}</option>)}</select></label><label className="text-sm font-medium">Business Profile location<select className="mt-1 block h-10 w-full rounded-md border bg-background px-3 font-normal" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">No location selected</option>{resources?.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label></div>{resources?.errors && Object.keys(resources.errors).length > 0 && <div className="space-y-1 rounded-md border border-destructive/20 bg-destructive/10 p-3">{Object.entries(resources.errors).map(([source, message]) => <p key={source} className="text-xs text-destructive"><span className="font-semibold capitalize">{source}</span> — Google says: {message}</p>)}</div>}<div className="flex flex-wrap gap-2"><Button onClick={save} disabled={working}>Save selections</Button><Button variant="outline" onClick={() => void load()} disabled={working}><RefreshCw className="mr-2 h-4 w-4" />Refresh accounts</Button><Button variant="ghost" className="text-destructive" onClick={disconnect} disabled={working}><Unplug className="mr-2 h-4 w-4" />Disconnect</Button></div></CardContent></Card>;
}
