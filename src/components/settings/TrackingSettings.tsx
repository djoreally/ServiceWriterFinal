import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchTrackingSettings, type TrackingSettings as TS } from "@/application/queries/tracking-settings.query";
import { saveTrackingEnabled, saveTrackingSettings } from "@/application/commands/tracking-settings.command";

const EMPTY: TS = {
  ga4_measurement_id: null,
  google_ads_id: null,
  google_ads_conversion_label: null,
  meta_pixel_id: null,
  custom_head_script: null,
  custom_body_script: null,
  enabled: false,
};

const GA4_RE = /^G-[A-Z0-9]+$/;
const ADS_RE = /^AW-[0-9]+$/;
const PIXEL_RE = /^[0-9]{6,20}$/;

export function TrackingSettings() {
  const [state, setState] = useState<TS>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchTrackingSettings()
      .then((d) => {
        if (cancelled) return;
        if (d) setState(d);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof TS>(k: K, v: TS[K]) => setState((s) => ({ ...s, [k]: v }));
  const norm = (v: string) => (v.trim() === "" ? null : v.trim());

  const ga4Valid = !state.ga4_measurement_id || GA4_RE.test(state.ga4_measurement_id);
  const adsValid = !state.google_ads_id || ADS_RE.test(state.google_ads_id);
  const pixelValid = !state.meta_pixel_id || PIXEL_RE.test(state.meta_pixel_id);

  const onEnabledChange = async (enabled: boolean) => {
    const previous = state.enabled;
    set("enabled", enabled);
    setSavingEnabled(true);

    try {
      await saveTrackingEnabled(enabled);
      const fresh = await fetchTrackingSettings();
      if (fresh) setState(fresh);
      toast.success(enabled ? "Tracking injection enabled" : "Tracking injection disabled");
    } catch (e: any) {
      set("enabled", previous);
      toast.error(e?.message || "Failed to save tracking switch");
    } finally {
      setSavingEnabled(false);
    }
  };

  const onSave = async () => {
    if (!ga4Valid || !adsValid || !pixelValid) {
      toast.error("Please fix the highlighted format errors before saving.");
      return;
    }
    setSaving(true);
    try {
      await saveTrackingSettings(state);
      // Re-fetch from DB so the UI reflects exactly what was persisted
      // (and never reverts to a stale in-flight value).
      const fresh = await fetchTrackingSettings();
      if (fresh) setState(fresh);
      toast.success("Tracking settings saved");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save tracking settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Tracking & Ads</CardTitle>
          <CardDescription>
            Connect your Google Analytics, Google Ads, and Meta Pixel to track visitors and conversions on your booking pages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="text-base">Enable tracking injection</Label>
              <p className="text-sm text-muted-foreground">Master switch for all tags below. Changes save immediately.</p>
            </div>
            <Switch checked={state.enabled} disabled={!loaded || saving || savingEnabled} onCheckedChange={onEnabledChange} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Analytics (GA4)</CardTitle>
          <CardDescription>Tracks page views, checkouts, and purchases.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Measurement ID</Label>
          <Input
            value={state.ga4_measurement_id ?? ""}
            onChange={(e) => set("ga4_measurement_id", norm(e.target.value.toUpperCase()))}
            placeholder="G-XXXXXXX"
            className="font-mono"
            aria-invalid={!ga4Valid}
          />
          {!ga4Valid && <p className="text-xs text-destructive">Must look like G-XXXXXXX (uppercase letters/numbers).</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google Ads</CardTitle>
          <CardDescription>Fires a conversion event on the booking confirmation page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>Ads ID</Label>
            <Input
              value={state.google_ads_id ?? ""}
              onChange={(e) => set("google_ads_id", norm(e.target.value.toUpperCase()))}
              placeholder="AW-1234567890"
              className="font-mono"
              aria-invalid={!adsValid}
            />
            {!adsValid && <p className="text-xs text-destructive">Must look like AW-1234567890.</p>}
          </div>
          <div className="space-y-2">
            <Label>Conversion Label</Label>
            <Input
              value={state.google_ads_conversion_label ?? ""}
              onChange={(e) => set("google_ads_conversion_label", norm(e.target.value))}
              placeholder="abc123XYZ"
              className="font-mono"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meta Pixel (optional)</CardTitle>
          <CardDescription>Tracks PageView, InitiateCheckout, and Purchase events for Facebook/Instagram ads.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Pixel ID</Label>
          <Input
            value={state.meta_pixel_id ?? ""}
            onChange={(e) => set("meta_pixel_id", norm(e.target.value))}
            placeholder="1234567890123456"
            className="font-mono"
            aria-invalid={!pixelValid}
          />
          {!pixelValid && <p className="text-xs text-destructive">Must be 6–20 digits.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Advanced — Custom Scripts</CardTitle>
          <CardDescription>For other tags (Hotjar, Clarity, etc.).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Use with caution</AlertTitle>
            <AlertDescription>
              Custom scripts run on every public booking page. We strip <code>&lt;iframe&gt;</code>, inline event handlers, and <code>eval()</code>,
              but you are responsible for the code you paste. Only use trusted tracking snippets.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label>Custom Head Script</Label>
            <Textarea
              value={state.custom_head_script ?? ""}
              onChange={(e) => set("custom_head_script", norm(e.target.value))}
              placeholder="<!-- Trusted tracking snippet -->"
              rows={4}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label>Custom Body Script</Label>
            <Textarea
              value={state.custom_body_script ?? ""}
              onChange={(e) => set("custom_body_script", norm(e.target.value))}
              placeholder="<!-- Trusted tracking snippet -->"
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving || savingEnabled}>
          {saving ? "Saving…" : "Save Tracking Settings"}
        </Button>
      </div>
    </div>
  );
}
