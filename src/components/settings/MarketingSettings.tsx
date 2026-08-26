import { useState, useEffect } from "react";
import {
  fetchMarketingSettings,
  type MarketingSettingsData,
} from "@/application/queries/marketing-settings.query";
import { saveMarketingSettings } from "@/application/commands/marketing-settings.command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Star, Clock, Save, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { MaintenanceReminderSettings } from "./MaintenanceReminderSettings";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateReviewUrl(value: string, domainHint: string): string | null {
  if (!value) return null;
  if (!isValidHttpUrl(value)) return "Please enter a valid URL (must start with http:// or https://)";
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (!hostname.includes(domainHint)) {
      return `URL does not look like a valid ${domainHint.charAt(0).toUpperCase() + domainHint.slice(1)} review link`;
    }
  } catch {
    return "Please enter a valid URL";
  }
  return null;
}

export const MarketingSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MarketingSettingsData>({
    google_review_url: "",
    yelp_review_url: "",
    review_request_delay_hours: 24,
    appointment_reminder_hours: 24,
    service_reminder_months: 3,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await fetchMarketingSettings();
    if (data) setSettings(data);
    setLoading(false);
  };

  const handleSave = async () => {
    const googleError = validateReviewUrl(settings.google_review_url, "google");
    const yelpError = validateReviewUrl(settings.yelp_review_url, "yelp");

    if (googleError) {
      toast.error(`Google Review URL: ${googleError}`);
      return;
    }
    if (yelpError) {
      toast.error(`Yelp Review URL: ${yelpError}`);
      return;
    }

    setSaving(true);
    try {
      await saveMarketingSettings(settings);
      toast.success("Marketing settings saved!");
    } catch {
      toast.error("Failed to save marketing settings");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Marketing Settings
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure automated marketing features like review requests and reminders
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Review URLs */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            <Star className="h-4 w-4" />
            Review Request Links
          </h4>
          <p className="text-sm text-muted-foreground">
            Add your business review URLs to automatically request reviews from customers after service completion.
          </p>
          
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="google_review_url">Google Business Review URL</Label>
              <div className="flex gap-2">
                <Input
                  id="google_review_url"
                  value={settings.google_review_url}
                  onChange={(e) => setSettings({ ...settings, google_review_url: e.target.value })}
                  placeholder="https://g.page/r/YOUR_BUSINESS_ID/review"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open("https://support.google.com/business/answer/7035772", "_blank")}
                  title="How to get your Google review link"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              {settings.google_review_url && validateReviewUrl(settings.google_review_url, "google") && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validateReviewUrl(settings.google_review_url, "google")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Get your link from Google Business Profile → Share review form
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="yelp_review_url">Yelp Business Review URL</Label>
              <div className="flex gap-2">
                <Input
                  id="yelp_review_url"
                  value={settings.yelp_review_url}
                  onChange={(e) => setSettings({ ...settings, yelp_review_url: e.target.value })}
                  placeholder="https://www.yelp.com/writeareview/biz/YOUR_BUSINESS_ID"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open("https://www.yelp.com/", "_blank")}
                  title="Find your Yelp business page"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              {settings.yelp_review_url && validateReviewUrl(settings.yelp_review_url, "yelp") && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {validateReviewUrl(settings.yelp_review_url, "yelp")}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Find your business on Yelp and copy the "Write a Review" link
              </p>
            </div>
          </div>
        </div>

        {/* Timing Settings */}
        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timing Settings
          </h4>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="review_delay">Review Request Delay</Label>
              <Select
                value={settings.review_request_delay_hours.toString()}
                onValueChange={(value) => setSettings({ ...settings, review_request_delay_hours: parseInt(value) })}
              >
                <SelectTrigger id="review_delay">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">24 hours</SelectItem>
                  <SelectItem value="48">48 hours</SelectItem>
                  <SelectItem value="72">72 hours</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Time after service to send review request
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="appointment_reminder">Appointment Reminder</Label>
              <Select
                value={settings.appointment_reminder_hours.toString()}
                onValueChange={(value) => setSettings({ ...settings, appointment_reminder_hours: parseInt(value) })}
              >
                <SelectTrigger id="appointment_reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 hour before</SelectItem>
                  <SelectItem value="24">24 hours before</SelectItem>
                  <SelectItem value="48">48 hours before</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                When to send appointment reminders
              </p>
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="service_reminder">Service Reminder Interval</Label>
              <Select
                value={settings.service_reminder_months.toString()}
                onValueChange={(value) => setSettings({ ...settings, service_reminder_months: parseInt(value) })}
              >
                <SelectTrigger id="service_reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">Every 3 months</SelectItem>
                  <SelectItem value="6">Every 6 months</SelectItem>
                  <SelectItem value="12">Every 12 months</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How often to remind for service
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save Marketing Settings
        </Button>
      </CardContent>
    </Card>

    {/* Maintenance Reminder Settings */}
    <MaintenanceReminderSettings 
      businessProfile={{ service_reminder_months: settings.service_reminder_months }}
      onSave={loadSettings}
    />
  </>
  );
};
