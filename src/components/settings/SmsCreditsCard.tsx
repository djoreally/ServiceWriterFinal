/**
 * SmsCreditsCard — prepaid SMS credit balance, top-up packs, monthly bundles,
 * low-balance threshold, and a test send.
 *
 * One credit = one SMS segment. Texts stop sending at zero credits; email
 * automations are unaffected.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSmsBundles,
  fetchSmsCreditBalance,
  fetchSmsCreditPurchases,
} from "@/application/queries/sms-credits.query";
import {
  sendTestSms,
  startSmsCreditCheckout,
  updateSmsChannelToggles,
  updateSmsLowBalanceThreshold,
} from "@/application/commands/sms-credits.command";
import { countSmsSegments } from "@/lib/smsSegments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MessageSquare, Send, Zap } from "lucide-react";
import { toast } from "@/components/ui/sonner";


const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function SmsCreditsCard() {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<string>("");
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Test message from your shop dashboard.");
  const [testing, setTesting] = useState(false);

  const { data: balance, isLoading } = useQuery({
    queryKey: ["sms-credit-balance"],
    queryFn: fetchSmsCreditBalance,
  });
  const { data: bundles = [] } = useQuery({ queryKey: ["sms-bundles"], queryFn: fetchSmsBundles });
  const { data: purchases = [] } = useQuery({
    queryKey: ["sms-credit-purchases"],
    queryFn: fetchSmsCreditPurchases,
  });

  const available = balance?.available ?? 0;
  const lowThreshold = balance?.low_balance_threshold ?? 50;
  const topUps = bundles.filter((b) => b.renewal_period === "one_time");
  const monthly = bundles.filter((b) => b.renewal_period !== "one_time");
  const transactionalOn = balance?.transactional_enabled ?? false;
  const marketingOn = balance?.marketing_enabled ?? false;

  // Returning from Stripe checkout: refresh the balance so purchased credits
  // appear as soon as the webhook has applied them.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("messaging_checkout");
    if (!state) return;
    if (state === "success") {
      toast.success("Payment received — your SMS credits are being added.");
      qc.invalidateQueries({ queryKey: ["sms-credit-balance"] });
      qc.invalidateQueries({ queryKey: ["sms-credit-purchases"] });
    } else if (state === "cancelled") {
      toast.info("Checkout cancelled — no credits were purchased.");
    }
    params.delete("messaging_checkout");
    const next = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${next ? `?${next}` : ""}`);
  }, [qc]);

  const setChannel = async (patch: { transactional?: boolean; marketing?: boolean }) => {
    try {
      await updateSmsChannelToggles(patch);
      await qc.invalidateQueries({ queryKey: ["sms-credit-balance"] });
      toast.success("Texting settings updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update texting settings");
    }
  };


  const buy = async (bundleKey: string) => {
    setBusyKey(bundleKey);
    try {
      const { url } = await startSmsCreditCheckout(bundleKey);
      if (!url) throw new Error("Checkout is not available yet.");
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
    } finally {
      setBusyKey(null);
    }
  };

  const saveThreshold = async () => {
    try {
      await updateSmsLowBalanceThreshold(Number(threshold));
      toast.success("Low-balance warning updated");
      qc.invalidateQueries({ queryKey: ["sms-credit-balance"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    }
  };

  const runTest = async () => {
    if (!testPhone.trim()) {
      toast.error("Enter a phone number for the test.");
      return;
    }
    setTesting(true);
    try {
      const result = await sendTestSms(testPhone.trim(), testMessage);
      if (result.sent) toast.success(`Test sent — ${result.segments ?? 1} credit(s) used`);
      else toast.error(`Not sent: ${result.reason ?? "unknown reason"}`);
      qc.invalidateQueries({ queryKey: ["sms-credit-balance"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send test");
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          SMS Credits
        </CardTitle>
        <CardDescription>
          One credit sends one message segment (160 characters). Texts pause automatically at zero
          credits — email automations keep running.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-6 rounded-lg border p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Available</p>
            <p className="text-3xl font-semibold tabular-nums">{available.toLocaleString()}</p>
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Monthly allotment: {(balance?.included_units ?? 0).toLocaleString()}</p>
            <p>Purchased top-ups: {(balance?.purchased_units ?? 0).toLocaleString()}</p>
            <p>
              Used this period: {(balance?.used_units ?? 0).toLocaleString()} · Pending:{" "}
              {(balance?.reserved_units ?? 0).toLocaleString()}
            </p>
          </div>
          <Badge variant={transactionalOn ? "default" : "secondary"} className="ml-auto">
            {transactionalOn ? "Texting active" : "Texting off"}
          </Badge>
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <h4 className="text-sm font-semibold">Activate texting</h4>
          <div className="flex items-start justify-between gap-4 border-b pb-3">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Appointment &amp; service texts</Label>
              <p className="text-xs text-muted-foreground">
                Confirmations, reschedules, reminders, and technician updates.
              </p>
            </div>
            <Switch
              checked={transactionalOn}
              onCheckedChange={(value) => setChannel({ transactional: value })}
              aria-label="Enable appointment and service texts"
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Marketing texts</Label>
              <p className="text-xs text-muted-foreground">
                Promotions and campaigns. Only sent to customers who opted in.
              </p>
            </div>
            <Switch
              checked={marketingOn}
              onCheckedChange={(value) => setChannel({ marketing: value })}
              aria-label="Enable marketing texts"
            />
          </div>
          {!transactionalOn && (
            <p className="text-xs text-muted-foreground">
              While this is off, every text is refused with “texting disabled” and no credits are used.
            </p>
          )}
        </div>

        {available <= lowThreshold && (
          <Alert>
            <AlertDescription>
              {available === 0
                ? "You're out of SMS credits — texts are paused until you top up."
                : `Low SMS balance: ${available} credits left.`}
            </AlertDescription>
          </Alert>
        )}


        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Zap className="h-4 w-4" /> One-time top-up packs
          </h4>
          <div className="grid gap-3 sm:grid-cols-3">
            {topUps.map((bundle) => (
              <div key={bundle.bundle_key} className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-medium">{bundle.name}</p>
                <p className="text-2xl font-semibold tabular-nums">
                  {bundle.credit_units.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">credits · never expire</p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => buy(bundle.bundle_key)}
                  disabled={busyKey === bundle.bundle_key}
                >
                  {busyKey === bundle.bundle_key && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Buy {money(bundle.price_cents)}
                </Button>
              </div>
            ))}
            {topUps.length === 0 && (
              <p className="text-sm text-muted-foreground">No top-up packs are available yet.</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Monthly bundles</h4>
          <div className="space-y-2">
            {monthly.map((bundle) => (
              <div
                key={bundle.bundle_key}
                className="flex items-center justify-between gap-4 rounded-md border px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{bundle.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {bundle.credit_units.toLocaleString()} credits every month
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => buy(bundle.bundle_key)}
                  disabled={busyKey === bundle.bundle_key}
                >
                  {busyKey === bundle.bundle_key && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {money(bundle.price_cents)}/mo
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sms-threshold">Warn me below</Label>
            <div className="flex gap-2">
              <Input
                id="sms-threshold"
                type="number"
                min={0}
                className="max-w-[120px]"
                value={threshold === "" ? String(lowThreshold) : threshold}
                onChange={(event) => setThreshold(event.target.value)}
              />
              <Button variant="outline" onClick={saveThreshold}>Save</Button>
            </div>
            <p className="text-xs text-muted-foreground">Credits remaining before we warn you.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sms-test-phone">Send a test message</Label>
            <Input
              id="sms-test-phone"
              placeholder="+1 555 867 5309"
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
            />
            <Input
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              aria-label="Test message body"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {countSmsSegments(testMessage)} credit(s)
              </span>
              <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send test
              </Button>
            </div>
          </div>
        </div>

        {purchases.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Recent purchases</h4>
            <div className="rounded-md border divide-y">
              {purchases.map((purchase) => (
                <div key={purchase.id} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{purchase.units.toLocaleString()} credits · {purchase.bundle_key}</span>
                  <span className="text-muted-foreground">
                    {new Date(purchase.created_at).toLocaleDateString()}
                    {purchase.amount_cents ? ` · ${money(purchase.amount_cents)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
