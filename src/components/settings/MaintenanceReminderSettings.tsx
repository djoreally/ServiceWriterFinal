import { useState } from "react";
import { sendMaintenanceReminders } from "@/application/commands/maintenance-reminders.command";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { 
  Bell, 
  Send, 
  Clock, 
  Gauge,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Mail
} from "lucide-react";
import { toast } from "sonner";

interface MaintenanceReminderSettingsProps {
  businessProfile: {
    service_reminder_months?: number;
  } | null;
  onSave?: () => void;
}

export const MaintenanceReminderSettings = ({ 
  businessProfile,
  onSave 
}: MaintenanceReminderSettingsProps) => {
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ sent: number; errors?: string[] } | null>(null);
  const [settings, setSettings] = useState({
    autoSend: false,
    daysBeforeDue: 7,
    milesBeforeDue: 500,
    includeHighPriority: true,
    includeMediumPriority: true,
    includeLowPriority: false
  });

  const handleSendReminders = async (sendAll = false) => {
    setSending(true);
    setLastResult(null);

    try {
      const data = await sendMaintenanceReminders(sendAll);
      setLastResult(data);

      if (data.sent > 0) {
        toast.success(`Sent ${data.sent} reminder email${data.sent > 1 ? 's' : ''}`);
      } else {
        toast.info("No customers needed reminders at this time");
      }

      if (data.errors?.length > 0) {
        toast.warning(`${data.errors.length} email(s) failed to send`);
      }
    } catch (error: any) {
      console.error("Error sending reminders:", error);
      toast.error(error.message || "Failed to send reminders");
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Maintenance Reminder Emails
            </CardTitle>
            <CardDescription>
              Automatically notify customers when their vehicle maintenance is due
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Mail className="h-3 w-3" />
            Email
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Reminder Triggers */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Reminder Triggers</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Days before due date</p>
                <p className="text-xs text-muted-foreground">Send reminders this many days before</p>
              </div>
              <Input
                type="number"
                value={settings.daysBeforeDue}
                onChange={(e) => setSettings(prev => ({ ...prev, daysBeforeDue: parseInt(e.target.value) || 7 }))}
                className="w-20"
                min={1}
                max={30}
              />
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
              <Gauge className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Miles before due mileage</p>
                <p className="text-xs text-muted-foreground">Send reminders when within this range</p>
              </div>
              <Input
                type="number"
                value={settings.milesBeforeDue}
                onChange={(e) => setSettings(prev => ({ ...prev, milesBeforeDue: parseInt(e.target.value) || 500 }))}
                className="w-20"
                min={100}
                max={2000}
                step={100}
              />
            </div>
          </div>
        </div>

        {/* Priority Filters */}
        <div className="space-y-4">
          <h4 className="font-medium text-sm">Include by Priority</h4>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="high-priority"
                checked={settings.includeHighPriority}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeHighPriority: checked }))}
              />
              <Label htmlFor="high-priority" className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-md bg-red-500" />
                High Priority
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="medium-priority"
                checked={settings.includeMediumPriority}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeMediumPriority: checked }))}
              />
              <Label htmlFor="medium-priority" className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-md bg-yellow-500" />
                Medium Priority
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="low-priority"
                checked={settings.includeLowPriority}
                onCheckedChange={(checked) => setSettings(prev => ({ ...prev, includeLowPriority: checked }))}
              />
              <Label htmlFor="low-priority" className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-md bg-gray-500" />
                Low Priority
              </Label>
            </div>
          </div>
        </div>

        {/* Last Result */}
        {lastResult && (
          <div className={`p-4 rounded-lg border ${lastResult.errors?.length ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-gray-500/10 border-gray-500/30'}`}>
            <div className="flex items-center gap-2">
              {lastResult.errors?.length ? (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-gray-600" />
              )}
              <div>
                <p className="font-medium">
                  {lastResult.sent} reminder{lastResult.sent !== 1 ? 's' : ''} sent successfully
                </p>
                {lastResult.errors?.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {lastResult.errors.length} failed to send
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={() => handleSendReminders(false)}
            disabled={sending}
            className="gap-2"
          >
            {sending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Due Reminders
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSendReminders(true)}
            disabled={sending}
            className="gap-2"
          >
            <Mail className="h-4 w-4" />
            Send All Reminders
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Reminders are sent to customers who have vehicles with active maintenance recommendations that are due or approaching their due date/mileage. 
          Customers without email addresses will be skipped.
        </p>
      </CardContent>
    </Card>
  );
};
