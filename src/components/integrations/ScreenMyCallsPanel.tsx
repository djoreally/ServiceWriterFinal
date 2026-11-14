import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PhoneCall, RefreshCw } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { ApiClientError } from "@/lib/api-client";
import type {
  NumberSearchResult,
  ScreenMyCallsStatus,
  TenDlcRegistrationInput,
  TenDlcState,
} from "@/lib/screenMyCalls";
import { fetchScreenMyCallsStatus } from "@/application/queries/screenmycalls.query";
import {
  connectScreenMyCalls,
  disconnectScreenMyCalls,
  purchaseScreenMyCallsNumber,
  registerScreenMyCalls10Dlc,
  searchScreenMyCallsNumbers,
  selectScreenMyCallsNumber,
  setScreenMyCallsMirror,
} from "@/application/commands/screenmycalls.command";

function errorText(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

const EMPTY_10DLC: TenDlcRegistrationInput = {
  legal_business_name: "",
  ein: "",
  business_type: "LLC",
  industry: "Automotive repair",
  website: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
  contact_email: "",
  contact_phone: "",
  use_case: "CUSTOMER_CARE",
  message_samples: [""],
};

/**
 * ScreenMyCalls connection — ServiceWriter is the hub of the bundle.
 * This panel IS the ScreenMyCalls signup: connect creates the shop's
 * ScreenMyCalls org on the ServiceWriter bundle (starter plan + 100
 * free minutes), then the shop picks/buys their number, turns on the
 * booking mirror, and can register their own 10DLC brand + campaign
 * for custom texting.
 */
export function ScreenMyCallsPanel() {
  const [status, setStatus] = useState<ScreenMyCallsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Connect form
  const [mode, setMode] = useState<"create" | "link">("create");
  const [businessName, setBusinessName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [linkCode, setLinkCode] = useState("");

  // Number step
  const [areaCode, setAreaCode] = useState("");
  const [results, setResults] = useState<NumberSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  // 10DLC step
  const [tenDlcForm, setTenDlcForm] = useState<TenDlcRegistrationInput>(EMPTY_10DLC);
  const [tenDlc, setTenDlc] = useState<TenDlcState | null>(null);

  const applyStatus = useCallback((next: ScreenMyCallsStatus) => {
    setStatus(next);
    setTenDlc(next.live?.tenDlc ?? null);
    setLoadError(null);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const { status: next } = await fetchScreenMyCallsStatus();
      applyStatus(next);
    } catch (err) {
      setLoadError(errorText(err, "Couldn't load the ScreenMyCalls connection."));
    } finally {
      setLoading(false);
    }
  }, [applyStatus]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { status: next } = await fetchScreenMyCallsStatus();
        if (!cancelled) {
          applyStatus(next);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(errorText(err, "Couldn't load the ScreenMyCalls connection."));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyStatus]);

  async function onConnect() {
    setBusy(true);
    try {
      await connectScreenMyCalls({
        mode,
        businessName: mode === "create" ? businessName : undefined,
        adminEmail: mode === "create" ? adminEmail : undefined,
        linkCode: mode === "link" ? linkCode : undefined,
      });
      toast.success("ScreenMyCalls connected — your 100 free minutes are ready.");
      await reload();
    } catch (err) {
      toast.error(errorText(err, "Couldn't connect ScreenMyCalls."));
    } finally {
      setBusy(false);
    }
  }

  async function onSearchNumbers() {
    setSearching(true);
    try {
      const numbers = await searchScreenMyCallsNumbers({ areaCode: areaCode || undefined, limit: 20 });
      setResults(numbers);
      if (numbers.length === 0) toast.info("No numbers matched — try a different area code.");
    } catch (err) {
      toast.error(errorText(err, "Number search failed."));
    } finally {
      setSearching(false);
    }
  }

  async function onPurchase(phoneNumber: string) {
    setBusy(true);
    try {
      await purchaseScreenMyCallsNumber(phoneNumber);
      toast.success(`${phoneNumber} is yours — it's now your ScreenMyCalls number.`);
      setResults(null);
      await reload();
    } catch (err) {
      toast.error(errorText(err, "The purchase didn't go through."));
    } finally {
      setBusy(false);
    }
  }

  async function onSelect(phoneNumber: string) {
    setBusy(true);
    try {
      await selectScreenMyCallsNumber(phoneNumber);
      toast.success(`${phoneNumber} is now your ScreenMyCalls number.`);
      await reload();
    } catch (err) {
      toast.error(errorText(err, "Couldn't select that number."));
    } finally {
      setBusy(false);
    }
  }

  async function onMirrorToggle(enabled: boolean) {
    setBusy(true);
    try {
      await setScreenMyCallsMirror(enabled);
      toast.success(enabled ? "Booking mirror is on." : "Booking mirror is off.");
      await reload();
    } catch (err) {
      toast.error(errorText(err, "Couldn't change the mirror setting."));
    } finally {
      setBusy(false);
    }
  }

  async function onRegister10Dlc() {
    setBusy(true);
    try {
      const samples = tenDlcForm.message_samples.map((s) => s.trim()).filter(Boolean);
      const state = await registerScreenMyCalls10Dlc({ ...tenDlcForm, message_samples: samples });
      setTenDlc(state);
      toast.success("10DLC registration filed — status will update as Telnyx reviews it.");
    } catch (err) {
      toast.error(errorText(err, "The 10DLC registration didn't go through."));
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setBusy(true);
    try {
      await disconnectScreenMyCalls();
      toast.success("ScreenMyCalls disconnected.");
      await reload();
    } catch (err) {
      toast.error(errorText(err, "Couldn't disconnect."));
    } finally {
      setBusy(false);
    }
  }

  const live = status?.live;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PhoneCall className="h-5 w-5" /> ScreenMyCalls
          {status?.connected ? <Badge variant="secondary">Connected</Badge> : null}
        </CardTitle>
        <CardDescription>
          Your AI receptionist, free with ServiceWriter — including 100 minutes to start. It answers your
          calls, books appointments, and mirrors every booking here so you can run the job from ServiceWriter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn't load</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : !status?.connected ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={mode === "create" ? "default" : "outline"} onClick={() => setMode("create")}>
                New to ScreenMyCalls
              </Button>
              <Button variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}>
                I already have ScreenMyCalls
              </Button>
            </div>
            {mode === "create" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="smc-business-name">Business name</Label>
                  <Input
                    id="smc-business-name"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="MOMS Mobile Oil Change"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smc-admin-email">Your email (account owner)</Label>
                  <Input
                    id="smc-admin-email"
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="you@yourshop.com"
                  />
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  We'll create your ScreenMyCalls account on the ServiceWriter bundle — starter plan with 100
                  free minutes, no card required — and email you the invite to finish setting your password.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="smc-link-code">Link code</Label>
                <Input
                  id="smc-link-code"
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value)}
                  placeholder="Paste the code from ScreenMyCalls → Settings → ServiceWriter"
                />
                <p className="text-sm text-muted-foreground">
                  In ScreenMyCalls, open Settings → ServiceWriter and generate a link code, then paste it here.
                </p>
              </div>
            )}
            <Button onClick={onConnect} disabled={busy}>
              {busy ? "Connecting…" : "Connect ScreenMyCalls"}
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Account: <strong>{status.organizationName ?? status.organizationId}</strong>
              </span>
              {live ? (
                <Badge variant="outline">
                  {live.bundle.minutesUsed} / {live.bundle.minutesIncluded ?? "∞"} bundle minutes used
                </Badge>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => void reload()}>
                <RefreshCw className="mr-1 h-4 w-4" /> Refresh
              </Button>
            </div>

            {/* Number step */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Your number</h3>
              {status.number ? (
                <p className="text-sm">
                  Callers reach your receptionist at <strong>{status.number}</strong>.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Pick the number your receptionist answers on.</p>
              )}
              {live && live.numbers.length > 0 ? (
                <div className="space-y-2">
                  {live.numbers.map((n) => (
                    <div key={n.phoneNumber} className="flex items-center justify-between gap-3 text-sm">
                      <span>{n.phoneNumber}</span>
                      {n.selected ? (
                        <Badge>Your number</Badge>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => void onSelect(n.phoneNumber)}>
                          Use this number
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="smc-area-code">Area code</Label>
                  <Input
                    id="smc-area-code"
                    value={areaCode}
                    onChange={(e) => setAreaCode(e.target.value)}
                    placeholder="215"
                    className="w-28"
                  />
                </div>
                <Button variant="outline" onClick={() => void onSearchNumbers()} disabled={searching}>
                  {searching ? "Searching…" : "Search new numbers"}
                </Button>
              </div>
              {results ? (
                <div className="space-y-2">
                  {results.map((n) => (
                    <div key={n.phoneNumber} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {n.phoneNumber}
                        {n.locality ? <span className="text-muted-foreground"> · {n.locality}, {n.region}</span> : null}
                      </span>
                      <Button size="sm" disabled={busy} onClick={() => void onPurchase(n.phoneNumber)}>
                        Buy this number
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Mirror step */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">Mirror bookings into ServiceWriter</h3>
                <p className="text-sm text-muted-foreground">
                  Every completed phone booking appears here as an appointment, so the job runs from
                  ServiceWriter. Your booking calendar stays the record; this is the working copy.
                </p>
                {live?.lastMirror ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Last mirror: {live.lastMirror.status}
                    {live.lastMirror.error ? ` — ${live.lastMirror.error}` : ""}
                  </p>
                ) : null}
              </div>
              <Switch
                checked={Boolean(status.mirrorEnabled ?? live?.mirrorEnabled)}
                onCheckedChange={(v) => void onMirrorToggle(v)}
                disabled={busy}
                aria-label="Mirror bookings into ServiceWriter"
              />
            </div>

            {/* 10DLC step */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold">Custom texting (10DLC)</h3>
              {tenDlc && tenDlc.status !== "not_started" ? (
                <div className="space-y-1 text-sm">
                  <p>
                    Status: <Badge variant="outline">{tenDlc.status}</Badge>
                  </p>
                  {tenDlc.brandId ? <p className="text-muted-foreground">Brand: {tenDlc.brandId} ({tenDlc.brandStatus ?? "pending"})</p> : null}
                  {tenDlc.campaignId ? <p className="text-muted-foreground">Campaign: {tenDlc.campaignId} ({tenDlc.campaignStatus ?? "pending"})</p> : null}
                  {tenDlc.failureReason ? <p className="text-destructive">{tenDlc.failureReason}</p> : null}
                  <p className="text-muted-foreground">
                    Until your own registration is active, texts send from the shared ScreenMyCalls messaging
                    profile.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Register your own A2P 10DLC brand and campaign with Telnyx so texts to your customers come
                    from your business identity. This files a real registration with the carrier registry —
                    use your legal business details exactly as they appear on your EIN paperwork.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="dlc-legal">Legal business name</Label>
                      <Input id="dlc-legal" value={tenDlcForm.legal_business_name} onChange={(e) => setTenDlcForm({ ...tenDlcForm, legal_business_name: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-ein">EIN (tax ID)</Label>
                      <Input id="dlc-ein" value={tenDlcForm.ein} onChange={(e) => setTenDlcForm({ ...tenDlcForm, ein: e.target.value })} placeholder="12-3456789" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-type">Business type</Label>
                      <Input id="dlc-type" value={tenDlcForm.business_type} onChange={(e) => setTenDlcForm({ ...tenDlcForm, business_type: e.target.value })} placeholder="LLC" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-industry">Industry</Label>
                      <Input id="dlc-industry" value={tenDlcForm.industry} onChange={(e) => setTenDlcForm({ ...tenDlcForm, industry: e.target.value })} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="dlc-address">Street address</Label>
                      <Input id="dlc-address" value={tenDlcForm.address} onChange={(e) => setTenDlcForm({ ...tenDlcForm, address: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-city">City</Label>
                      <Input id="dlc-city" value={tenDlcForm.city} onChange={(e) => setTenDlcForm({ ...tenDlcForm, city: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-state">State</Label>
                      <Input id="dlc-state" value={tenDlcForm.state} onChange={(e) => setTenDlcForm({ ...tenDlcForm, state: e.target.value })} placeholder="PA" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-zip">ZIP</Label>
                      <Input id="dlc-zip" value={tenDlcForm.postal_code} onChange={(e) => setTenDlcForm({ ...tenDlcForm, postal_code: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-website">Website</Label>
                      <Input id="dlc-website" value={tenDlcForm.website ?? ""} onChange={(e) => setTenDlcForm({ ...tenDlcForm, website: e.target.value })} placeholder="https://yourshop.com" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-email">Contact email</Label>
                      <Input id="dlc-email" type="email" value={tenDlcForm.contact_email} onChange={(e) => setTenDlcForm({ ...tenDlcForm, contact_email: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="dlc-phone">Contact phone</Label>
                      <Input id="dlc-phone" value={tenDlcForm.contact_phone} onChange={(e) => setTenDlcForm({ ...tenDlcForm, contact_phone: e.target.value })} placeholder="+12155550123" />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="dlc-sample">Sample message</Label>
                      <Textarea
                        id="dlc-sample"
                        value={tenDlcForm.message_samples[0] ?? ""}
                        onChange={(e) => setTenDlcForm({ ...tenDlcForm, message_samples: [e.target.value] })}
                        placeholder="Hi {name}, this is {shop} confirming your oil change tomorrow at 10 AM. Reply STOP to end."
                      />
                    </div>
                  </div>
                  <Button onClick={() => void onRegister10Dlc()} disabled={busy}>
                    {busy ? "Filing…" : "File 10DLC registration"}
                  </Button>
                </div>
              )}
            </div>

            <div className="border-t pt-4">
              <Button variant="destructive" onClick={() => void onDisconnect()} disabled={busy}>
                Disconnect ScreenMyCalls
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
