/**
 * Checkout error states with recovery paths
 * Each error type has specific UI copy and action
 */

import { AlertCircle, CreditCard, RefreshCw, Clock, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckoutErrorType } from "./checkoutErrors.utils";

// Re-export for convenience
export type { CheckoutErrorType } from "./checkoutErrors.utils";

interface CheckoutErrorProps {
  errorType: CheckoutErrorType;
  errorMessage?: string;
  onRetry?: () => void;
  onGoBack?: () => void;
  onSelectNewTime?: () => void;
  onReviewPricing?: () => void;
}

const ERROR_CONFIG: Record<CheckoutErrorType, {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'default' | 'destructive';
  recoveryAction?: string;
}> = {
  card_declined: {
    title: "Payment Declined",
    description: "Your card was declined. Please check your card details or try a different payment method.",
    icon: CreditCard,
    variant: 'destructive',
    recoveryAction: 'Try again with different card',
  },
  provider_not_enabled: {
    title: "Payments Not Available",
    description: "This business hasn't completed their payment setup yet. Please try booking with pay-on-arrival instead.",
    icon: AlertCircle,
    variant: 'default',
    recoveryAction: 'Book with pay later',
  },
  stripe_outage: {
    title: "Payment System Temporarily Unavailable",
    description: "We're experiencing issues with our payment processor. Your booking has been saved. Please try again in a few minutes.",
    icon: AlertTriangle,
    variant: 'default',
    recoveryAction: 'Try again in a moment',
  },
  webhook_delay: {
    title: "Processing Your Payment",
    description: "Your payment is being processed. You'll receive a confirmation email shortly. If you don't receive it within 5 minutes, please contact us.",
    icon: Clock,
    variant: 'default',
  },
  duplicate_checkout: {
    title: "Booking Already In Progress",
    description: "It looks like you already have a checkout in progress. Please complete or cancel your existing checkout first.",
    icon: RefreshCw,
    variant: 'default',
    recoveryAction: 'Continue existing checkout',
  },
  price_changed: {
    title: "Pricing Has Changed",
    description: "The prices for one or more services have been updated since you started. Please review the new pricing before continuing.",
    icon: AlertTriangle,
    variant: 'default',
    recoveryAction: 'Review new pricing',
  },
  slot_taken: {
    title: "Time Slot No Longer Available",
    description: "Sorry, someone just booked this time slot. Please select a different time.",
    icon: Clock,
    variant: 'default',
    recoveryAction: 'Select new time',
  },
  network_error: {
    title: "Connection Issue",
    description: "We couldn't connect to our servers. Please check your internet connection and try again.",
    icon: XCircle,
    variant: 'destructive',
    recoveryAction: 'Retry',
  },
  rate_limit: {
    title: "Please Wait Before Retrying",
    description: "Booking submissions are temporarily paused to prevent duplicate appointments. Please wait a moment, then try again.",
    icon: Clock,
    variant: 'default',
    recoveryAction: 'Retry booking',
  },
  unknown: {
    title: "Something Went Wrong",
    description: "An unexpected error occurred. Please try again or contact support if the issue persists.",
    icon: AlertCircle,
    variant: 'destructive',
    recoveryAction: 'Try again',
  },
};

export function CheckoutErrorAlert({ 
  errorType, 
  errorMessage,
  onRetry,
  onGoBack,
  onSelectNewTime,
  onReviewPricing,
}: CheckoutErrorProps) {
  const config = ERROR_CONFIG[errorType];
  const Icon = config.icon;

  const getRecoveryButton = () => {
    switch (errorType) {
      case 'slot_taken':
        return onSelectNewTime ? (
          <Button onClick={onSelectNewTime} variant="default" size="sm">
            Select New Time
          </Button>
        ) : null;
      case 'price_changed':
        return onReviewPricing ? (
          <Button onClick={onReviewPricing} variant="default" size="sm">
            Review Pricing
          </Button>
        ) : null;
      case 'provider_not_enabled':
        return onGoBack ? (
          <Button onClick={onGoBack} variant="default" size="sm">
            Choose Pay Later
          </Button>
        ) : null;
      default:
        return onRetry && config.recoveryAction ? (
          <Button onClick={onRetry} variant="default" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            {config.recoveryAction}
          </Button>
        ) : null;
    }
  };

  return (
    <Alert variant={config.variant}>
      <Icon className="h-4 w-4" />
      <AlertTitle>{config.title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{errorMessage || config.description}</p>
        <div className="mt-4 flex gap-2">
          {getRecoveryButton()}
          {onGoBack && errorType !== 'provider_not_enabled' && (
            <Button onClick={onGoBack} variant="outline" size="sm">
              Go Back
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function CheckoutErrorCard({ 
  errorType, 
  errorMessage,
  onRetry,
  onGoBack,
  onSelectNewTime,
  onReviewPricing,
}: CheckoutErrorProps) {
  const config = ERROR_CONFIG[errorType];
  const Icon = config.icon;

  return (
    <Card className="max-w-md mx-auto border-destructive/50">
      <CardHeader className="text-center pb-2">
        <div className={`mx-auto p-3 rounded-md ${config.variant === 'destructive' ? 'bg-destructive/10' : 'bg-muted'} mb-2`}>
          <Icon className={`h-8 w-8 ${config.variant === 'destructive' ? 'text-destructive' : 'text-muted-foreground'}`} />
        </div>
        <CardTitle className="text-lg">{config.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-muted-foreground">
        <p>{errorMessage || config.description}</p>
      </CardContent>
      <CardFooter className="flex justify-center gap-2">
        {errorType === 'slot_taken' && onSelectNewTime && (
          <Button onClick={onSelectNewTime}>Select New Time</Button>
        )}
        {errorType === 'price_changed' && onReviewPricing && (
          <Button onClick={onReviewPricing}>Review Pricing</Button>
        )}
        {!['slot_taken', 'price_changed', 'webhook_delay'].includes(errorType) && onRetry && (
          <Button onClick={onRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        )}
        {onGoBack && (
          <Button onClick={onGoBack} variant="outline">Go Back</Button>
        )}
      </CardFooter>
    </Card>
  );
}
