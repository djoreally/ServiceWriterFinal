import { useState, useEffect } from "react";
import { fetchStripeConnectStatus, startStripeConnectOnboarding, type StripeConnectStatus } from "@/application/queries/stripe-connect.query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { Badge } from "@/components/ui/badge";

export const StripeConnectCard = () => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<StripeConnectStatus>({
    connected: false,
    chargesEnabled: false,
    payoutsEnabled: false,
    detailsSubmitted: false,
  });

  const fetchStatus = async () => {
    try {
      const data = await fetchStripeConnectStatus();
      setStatus(data);
    } catch (error) {
      console.error("Error fetching Stripe status:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchStatus());

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("stripe_success") === "true") {
          toast.success("Stripe account setup in progress! Status will update shortly.");
          window.history.replaceState({}, "", window.location.pathname);
          void Promise.resolve().then(() => setTimeout(fetchStatus, 2000));
        } else if (params.get("stripe_refresh") === "true") {
          toast.info("Please complete your Stripe account setup.");
          window.history.replaceState({}, "", window.location.pathname);
        }
      } catch (e) {
        // ignore URL parsing errors in non-browser environments
      }
    }
  }, []);

  /** Start onboarding — creates a new Standard account + Account Link */
  const handleConnectStripe = async (mode: "create" | "oauth" = "create") => {
    setConnecting(true);
    try {
      const url = await startStripeConnectOnboarding(mode);
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (error) {
      console.error("Error connecting to Stripe:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to Stripe");
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Payment Processing
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Connect your Stripe account to accept deposits and payments from customers
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status.connected ? (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm">Connect with Stripe to:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Accept deposits when customers book appointments</li>
                <li>Process payments securely</li>
                <li>Get paid directly to your bank account</li>
                <li>Full access to your Stripe Dashboard</li>
              </ul>
            </div>

            {/* Primary: Create new Stripe account */}
            <Button onClick={() => handleConnectStripe("create")} disabled={connecting} className="gap-2 w-full">
              {connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="h-4 w-4" />
              )}
              Create & Connect Stripe Account
            </Button>

            {/* Secondary: Connect existing account */}
            <Button
              onClick={() => handleConnectStripe("oauth")}
              disabled={connecting}
              variant="outline"
              className="gap-2 w-full"
            >
              <ExternalLink className="h-4 w-4" />
              Connect Existing Stripe Account
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Stripe Account</span>
                <Badge variant={status.detailsSubmitted ? "default" : "secondary"}>
                  {status.detailsSubmitted ? "Connected" : "Pending"}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  {status.chargesEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-gray-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className={status.chargesEnabled ? "text-foreground" : "text-muted-foreground"}>
                    Accept Payments
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {status.payoutsEnabled ? (
                    <CheckCircle2 className="h-4 w-4 text-gray-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className={status.payoutsEnabled ? "text-foreground" : "text-muted-foreground"}>
                    Receive Payouts
                  </span>
                </div>
              </div>
            </div>

            {!status.detailsSubmitted && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Complete Your Setup</p>
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Finish setting up your Stripe account to start accepting payments.
                    </p>
                  </div>
                </div>
                <Button onClick={() => handleConnectStripe("create")} disabled={connecting} variant="outline" className="gap-2">
                  {connecting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4" />
                  )}
                  Continue Setup
                </Button>
              </div>
            )}

            {status.detailsSubmitted && status.chargesEnabled && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-gray-600 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-green-200">
                      Ready to Accept Payments
                    </p>
                    <p className="text-sm text-gray-700 dark:text-green-300">
                      Your account is fully set up. Customers can now pay deposits when booking.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ⚡ Standard accounts: link to full Stripe Dashboard (not Express login) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("https://dashboard.stripe.com", "_blank")}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Open Stripe Dashboard
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
