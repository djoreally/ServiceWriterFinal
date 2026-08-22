/**
 * TechSettings — Account settings for technicians
 * 
 * Theme toggle, notification preferences, sign out
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, LogOut, Bell, Palette,
} from "lucide-react";
import { saveTechNotificationPreferences, signOutCurrentUser } from "@/application/commands/tech-app.command";
import { fetchTechNotificationSettingsForCurrentUser } from "@/application/queries/tech-app.query";
import { DEFAULT_TECH_NOTIFICATION_PREFERENCES, type TechnicianNotificationPreferences } from "@/lib/technician-notification-preferences";
import { toast } from "sonner";
import { ThemeModeSelect } from "@/components/ThemeModeSelect";
import { CalendarIntegration } from "@/components/settings/CalendarIntegration";

export default function TechSettings() {
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<TechnicianNotificationPreferences>(DEFAULT_TECH_NOTIFICATION_PREFERENCES);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const pref = await fetchTechNotificationSettingsForCurrentUser();
        if (mounted) setPreferences(pref);
      } catch (error) {
        console.error("[TechSettings] Failed to load notification preferences", error);
        toast.error("Failed to load notification settings");
      } finally {
        if (mounted) setLoadingPrefs(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handlePreferenceChange = async (key: keyof TechnicianNotificationPreferences, checked: boolean) => {
    const previous = preferences;
    const next = { ...preferences, [key]: checked };
    setPreferences(next);
    setSavingPrefs(true);
    const { error } = await saveTechNotificationPreferences(next);
    setSavingPrefs(false);

    if (error) {
      toast.error("Failed to save notification setting");
      setPreferences(previous);
      return;
    }

    toast.success("Technician preferences saved");
  };

  const handleSignOut = async () => {
    await signOutCurrentUser();
    toast.success("Signed out");
    navigate("/login");
  };

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/tech-app/more")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Appearance */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Appearance</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5" />
              <span className="text-sm">Theme mode</span>
            </div>
            <ThemeModeSelect />
            <p className="text-xs text-muted-foreground">Choose light, dark, system, time-based auto, or high-contrast mode.</p>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notifications</h3>
          {[
            ["pushNotificationsEnabled", "Push notifications", "Master device push toggle."],
            ["dispatchPushEnabled", "Dispatch channel", "Internal dispatch messages and job-thread alerts."],
            ["customerSmsEnabled", "Customer SMS channel", "Allow explicit customer SMS sends from job threads."],
            ["customerEmailEnabled", "Customer email channel", "Allow explicit customer email sends from job threads."],
            ["offlineCacheEnabled", "Offline mission cache", "Cache mission board and job context for field recovery."],
          ].map(([key, label, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="flex items-start gap-3">
                <Bell className="mt-0.5 h-5 w-5" />
                <div>
                  <span className="text-sm font-medium">{label}</span>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </div>
              <Switch
                checked={preferences[key as keyof TechnicianNotificationPreferences]}
                disabled={loadingPrefs || savingPrefs}
                onCheckedChange={(checked) => handlePreferenceChange(key as keyof TechnicianNotificationPreferences, checked)}
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Stored as backend account preferences and synced across devices. External channels stay disabled until explicitly enabled.
          </p>
        </CardContent>
      </Card>

      {/* Google Calendar Sync */}
      <CalendarIntegration />

      <Separator />

      {/* Sign Out */}
      <Button
        variant="destructive"
        className="w-full h-14 text-base gap-2"
        onClick={handleSignOut}
      >
        <LogOut className="h-5 w-5" /> Sign Out
      </Button>
    </div>
  );
}
