import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreditCard, CheckCircle2, Loader2, ExternalLink, DollarSign, Shield, Zap } from "lucide-react";
import { checkStripeOnboardingStatus, startStripeOnboarding } from "@/application/commands";
import { toast } from "@/components/ui/sonner";

interface PaymentSetupStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

export const PaymentSetupStep = ({ onNext, onBack, onSkip }: PaymentSetupStepProps) => {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkStripeStatus();
  }, []);

  const checkStripeStatus = async () => {
    try {
      const status = await checkStripeOnboardingStatus();
      if (status.connected && status.chargesEnabled) {
        setIsConnected(true);
      }
    } catch (error) {
      console.error("Error checking Stripe status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setConnecting(true);
    try {
      const url = await startStripeOnboarding();
      window.location.href = url;
    } catch (error) {
      console.error("Error connecting to Stripe:", error);
      toast.error(error instanceof Error ? error.message : "Failed to connect to Stripe");
    } finally {
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-none">
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isConnected) {
    return (
      <Card className="border-0 shadow-none">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-12 h-12 rounded-md bg-gray-100 dark:bg-gray-900/30 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-6 w-6 text-gray-600" />
          </div>
          <CardTitle className="text-2xl">Payments Ready!</CardTitle>
          <CardDescription className="text-base">
            Your Stripe account is connected and ready to accept payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 max-w-md mx-auto">
          <div className="bg-green-50 dark:bg-green-950/30 border border-gray-200 dark:border-green-800 rounded-lg p-4">
            <p className="text-sm text-gray-700 dark:text-green-300">
              ✓ You can now accept deposits when customers book appointments
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={onBack} className="flex-1">
              Back
            </Button>
            <Button onClick={onNext} className="flex-1">
              Finish Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
          <CreditCard className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Accept Payments</CardTitle>
        <CardDescription className="text-base">
          Connect with Stripe to accept deposits and payments from customers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 max-w-md mx-auto">
        {/* Benefits */}
        <div className="grid gap-3">
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <DollarSign className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Collect deposits upfront</p>
              <p className="text-xs text-muted-foreground">Reduce no-shows by requiring payment at booking</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Shield className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Secure processing</p>
              <p className="text-xs text-muted-foreground">Industry-leading payment security by Stripe</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <Zap className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-sm">Fast payouts</p>
              <p className="text-xs text-muted-foreground">Get paid directly to your bank account</p>
            </div>
          </div>
        </div>

        <Button
          onClick={handleConnectStripe}
          disabled={connecting}
          className="w-full"
          size="lg"
        >
          {connecting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4 mr-2" />
          )}
          Connect with Stripe
        </Button>

        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            Back
          </Button>
          <Button variant="ghost" onClick={onSkip} className="flex-1">
            Skip for now
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          You can always set this up later in Settings
        </p>
      </CardContent>
    </Card>
  );
};
