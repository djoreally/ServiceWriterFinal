import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getMessagingPreferenceWorkspaceOwnerUserId } from "@/application/queries/customer-messaging-preferences.query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordBookingConsent } from "@/application/commands/customer-messaging.command";
import { toast } from "@/components/ui/sonner";

const TRANSACTIONAL_SMS_TEXT = "Text me appointment confirmations, reminders, and service updates. Message/data rates may apply. Reply STOP to opt out.";
const MARKETING_SMS_TEXT = "Send me promotional text offers and service specials. Message/data rates may apply. Reply STOP to unsubscribe.";
const MARKETING_EMAIL_TEXT = "Email me maintenance reminders, offers, and updates. I can unsubscribe from marketing emails at any time.";

export default function CustomerMessagingPreferences() {
  const [params] = useSearchParams();
  const workspaceOwnerUserId = getMessagingPreferenceWorkspaceOwnerUserId(params);
  const [email, setEmail] = useState(params.get("email") || "");
  const [phone, setPhone] = useState(params.get("phone") || "");
  const [transactionalSms, setTransactionalSms] = useState(params.get("transactional_sms") !== "false");
  const [marketingSms, setMarketingSms] = useState(params.get("marketing_sms") === "true");
  const [marketingEmail, setMarketingEmail] = useState(params.get("marketing_email") === "true");
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(
    () => Boolean(workspaceOwnerUserId && (email.trim() || phone.trim())),
    [email, phone, workspaceOwnerUserId],
  );

  const save = async () => {
    if (!canSave) {
      toast.error("Enter the email or phone number used for your booking.");
      return;
    }
    setSaving(true);
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim(); // Should ideally be normalized
    const signature = params.get("sig") || "";

    try {
      await recordBookingConsent({
        userId: workspaceOwnerUserId!,
        email: trimmedEmail || null,
        phone: trimmedPhone || null,
        transactionalSmsConsent: transactionalSms,
        marketingSmsConsent: marketingSms,
        marketingEmailConsent: marketingEmail,
        consentTexts: {
          transactionalSms: TRANSACTIONAL_SMS_TEXT,
          marketingSms: MARKETING_SMS_TEXT,
          marketingEmail: MARKETING_EMAIL_TEXT,
        },
        source: "customer_preferences",
        signature: signature || undefined,
      });
      toast.success("Messaging preferences updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update preferences.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Messaging Preferences</CardTitle>
          <CardDescription>
            Update appointment text updates, promotional texts, and marketing email preferences for this service provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!workspaceOwnerUserId && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              This preferences link is missing a provider identifier. Please use the link from your message or contact the shop.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="pref-email">Email</Label>
            <Input id="pref-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pref-phone">Phone</Label>
            <Input id="pref-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={transactionalSms} onCheckedChange={(checked) => setTransactionalSms(checked === true)} />
            <span>{TRANSACTIONAL_SMS_TEXT}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={marketingSms} onCheckedChange={(checked) => setMarketingSms(checked === true)} />
            <span>{MARKETING_SMS_TEXT}</span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <Checkbox checked={marketingEmail} onCheckedChange={(checked) => setMarketingEmail(checked === true)} />
            <span>{MARKETING_EMAIL_TEXT}</span>
          </label>
          <Button onClick={save} disabled={saving || !canSave} className="w-full">
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
