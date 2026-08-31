/**
 * SmsSettings — SMS automation settings (provider-agnostic delivery).
 *
 * Enable/disable confirmation, reschedule, cancellation, and reminder SMS;
 * choose how many hours before each appointment the reminder fires; and
 * customize the message templates (with {{first_name}}, {{business_name}},
 * {{when}}, {{title}} placeholders).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSmsPreferences, type SmsPreferences } from "@/application/queries/sms-preferences.query";
import { upsertSmsPreferences } from "@/application/commands/sms-preferences.command";

import { toast } from "@/components/ui/sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2, MessageSquare } from "lucide-react";

const DEFAULTS = {
  confirmation:
    "Hi {{first_name}}, your booking with {{business_name}} is confirmed for {{when}}. Reply STOP to opt out.",
  reschedule:
    "Hi {{first_name}}, your appointment with {{business_name}} has been rescheduled to {{when}}. Reply STOP to opt out.",
  cancellation:
    "Hi {{first_name}}, your appointment with {{business_name}} on {{when}} has been cancelled. Contact us to rebook. Reply STOP to opt out.",
  reminder:
    "Hi {{first_name}}, reminder: your appointment with {{business_name}} is {{when}}. Reply STOP to opt out.",
};

type Prefs = SmsPreferences;

export function SmsSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sms-preferences"],
    queryFn: () => fetchSmsPreferences(),
  });

  useEffect(() => {
    if (data) void Promise.resolve().then(() => setForm(data));
  }, [data]);

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await upsertSmsPreferences(form);
      toast.success("SMS settings saved");
      qc.invalidateQueries({ queryKey: ["sms-preferences"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };


  if (isLoading || !form) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const toggleRow = (
    key: keyof Prefs,
    label: string,
    description: string,
  ) => (
    <div className="flex items-start justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={Boolean(form[key])}
        onCheckedChange={(v) => setForm({ ...form, [key]: v })}
      />
    </div>
  );

  const templateRow = (
    key: "template_confirmation" | "template_reschedule" | "template_cancellation" | "template_reminder",
    label: string,
    defaultText: string,
  ) => (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      <Textarea
        rows={3}
        placeholder={defaultText}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          SMS Automation
        </CardTitle>
        <CardDescription>
          Choose which texts go out automatically and customize the wording. Each
          message segment (160 characters) costs one SMS credit. Available placeholders: <code>{"{{first_name}}"}</code>,{" "}
          <code>{"{{business_name}}"}</code>, <code>{"{{when}}"}</code>,{" "}
          <code>{"{{title}}"}</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h4 className="text-sm font-semibold mb-2">Message types</h4>
          <div className="rounded-md border px-4">
            {toggleRow(
              "confirmation_enabled",
              "Booking confirmation",
              "Sent immediately after a customer books an appointment.",
            )}
            {toggleRow(
              "reschedule_enabled",
              "Reschedule notice",
              "Sent when an appointment date/time changes.",
            )}
            {toggleRow(
              "cancellation_enabled",
              "Cancellation notice",
              "Sent when an appointment is cancelled.",
            )}
            {toggleRow(
              "reminder_enabled",
              "Appointment reminder",
              "Automatic reminder before each appointment.",
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reminder_hours_before">
            Reminder window (hours before appointment)
          </Label>
          <Input
            id="reminder_hours_before"
            type="number"
            min={1}
            max={168}
            className="max-w-[120px]"
            value={form.reminder_hours_before}
            onChange={(e) =>
              setForm({
                ...form,
                reminder_hours_before: Math.max(1, Number(e.target.value) || 24),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            Cron runs every 5 minutes and sends within a 30-minute window of
            this offset.
          </p>
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Templates (leave blank for defaults)</h4>
          {templateRow("template_confirmation", "Confirmation", DEFAULTS.confirmation)}
          {templateRow("template_reschedule", "Reschedule", DEFAULTS.reschedule)}
          {templateRow("template_cancellation", "Cancellation", DEFAULTS.cancellation)}
          {templateRow("template_reminder", "Reminder", DEFAULTS.reminder)}
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save SMS settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
