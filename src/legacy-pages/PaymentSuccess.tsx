/**
 * PaymentSuccess.tsx
 * 
 * ENTERPRISE PATTERN: Webhook-driven state
 * - This page does NOT assume payment success
 * - It polls the payment_records table for webhook-confirmed status
 * - Shows "pending" until webhook confirms the payment
 * - Prevents false positives from Stripe redirect
 */

import { useEffect, useState, useCallback, useRef } from "react";
import useIsClient from "@/hooks/useIsClient";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Calendar,
  Clock,
  Car,
  Mail,
  Home,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import {
  fetchPaymentSuccessBookingDetails,
  type PaymentSuccessBookingDetails,
} from "@/application/queries";
import { ensureBookingPaymentVerified } from "@/application/commands";
import { formatMoney } from "@/lib/financialMath";
import { TenantTrackingScripts } from "@/components/tracking/TenantTrackingScripts";
import { trackPaymentSucceeded, trackPaymentFailed } from "@/lib/posthog/analytics";

// Maximum time to wait for webhook confirmation (60 seconds)
const MAX_POLL_DURATION_MS = 60000;
const POLL_INTERVAL_MS = 2000;

export default function PaymentSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<PaymentSuccessBookingDetails | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);
  const isClient = useIsClient();

  const sessionId = searchParams.get("session_id");
  const paymentRecordId = searchParams.get("payment_record_id");
  const paymentStatus = searchParams.get("payment");

  const fetchBookingDetails = useCallback(
    async (): Promise<PaymentSuccessBookingDetails | null> => {
    const lookupId = sessionId || paymentRecordId;
    if (!lookupId) return null;

    try {
      return await fetchPaymentSuccessBookingDetails(lookupId);
    } catch (err) {
      console.error("Error fetching booking details:", err);
      return null;
    }
  }, [sessionId, paymentRecordId]);

  useEffect(() => {
    // If no session ID and just payment=success, show pending state
    if (paymentStatus === "success" && !sessionId) {
      void Promise.resolve().then(() => setBooking({
        businessName: "Auto Service",
        customerName: "Customer",
        customerEmail: "",
        scheduledDate: "",
        scheduledTime: "",
        serviceName: "Your booked services",
        amount: 0,
        currency: "USD",
        confirmationNumber: "PROCESSING",
        status: "pending",
      }));
      void Promise.resolve().then(() => setLoading(false));
      return;
    }

    if (!sessionId && !paymentRecordId) {
      void Promise.resolve().then(() => setError("No session information found"));
      void Promise.resolve().then(() => setLoading(false));
      return;
    }

    // ENTERPRISE: First attempt to verify + create the booking from the success redirect.
    // This makes the system robust even if webhooks are delayed/misconfigured.
    const ensureVerified = async () => {
      if (!sessionId) return;
      await ensureBookingPaymentVerified(sessionId);
    };

    // ENTERPRISE: Poll for payment status (record created by webhook or verification)
    if (pollStartTimeRef.current === null) {
      pollStartTimeRef.current = Date.now();
    }

    const pollForConfirmation = async () => {
      const result = await fetchBookingDetails();

      if (result) {
        setBooking(result);

        // If payment is confirmed (success or failure), stop polling
        if (result.status === "succeeded" || result.status === "failed") {
          setLoading(false);

          const commonProps = {
            organization_id: result.userId ?? undefined,
            appointment_id: result.appointmentId ?? undefined,
            payment_id: paymentRecordId ?? undefined,
            amount_cents: typeof result.amount === "number"
              ? Math.round(result.amount * 100)
              : undefined,
            currency: result.currency ?? undefined,
            provider: result.provider ?? "stripe",
          };
          if (result.status === "succeeded") {
            trackPaymentSucceeded(commonProps);
            // Clear all booking-* keys from sessionStorage
            try {
              Object.keys(sessionStorage).forEach((key) => {
                if (key.startsWith("booking-")) {
                  sessionStorage.removeItem(key);
                }
              });
            } catch {
              // sessionStorage may be unavailable
            }
          } else {
            trackPaymentFailed(commonProps);
          }
          return;
        }
      }

      // Check if we've exceeded max poll duration
      const start = pollStartTimeRef.current ?? Date.now();
      if (Date.now() - start > MAX_POLL_DURATION_MS) {
        // Timeout - show pending state with message
        setBooking({
          businessName: "Auto Service",
          customerName: "Customer",
          customerEmail: "",
          scheduledDate: "",
          scheduledTime: "",
          serviceName: "Your booked services",
          amount: 0,
          currency: "USD",
          confirmationNumber: sessionId ? sessionId.slice(-8).toUpperCase() : "PROCESSING",
          status: "pending",
        });
        setLoading(false);
        return;
      }

      // Continue polling
      setTimeout(pollForConfirmation, POLL_INTERVAL_MS);
    };

    (async () => {
      await ensureVerified();
      await pollForConfirmation();
    })();
  }, [sessionId, paymentRecordId, paymentStatus, fetchBookingDetails, pollStartTimeRef]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Confirming your payment...</p>
          <p className="text-sm text-muted-foreground mt-2">This may take a few seconds</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="bg-indigo-100 dark:bg-indigo-900/20 rounded-md p-4 w-fit mx-auto mb-4">
              <Mail className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Session Not Found</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => navigate("/")} className="gap-2">
              <Home className="h-4 w-4" />
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ENTERPRISE: Show different UI based on webhook-confirmed status
  if (booking?.status === "pending") {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-b from-indigo-50 to-background dark:from-indigo-950/20 dark:to-background py-12">
          <div className="container mx-auto px-4 text-center">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-md p-6 w-fit mx-auto mb-6">
              <Loader2 className="h-16 w-16 text-indigo-600 dark:text-indigo-400 animate-spin" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Payment Processing</h1>
            <p className="text-muted-foreground text-lg">
              Your payment is being processed. You'll receive a confirmation email shortly.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Card className="bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-indigo-600 mt-0.5" />
                <div>
                  <p className="font-medium text-indigo-800 dark:text-indigo-200">
                    Confirmation Pending
                  </p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">
                    Your payment has been submitted to Stripe. Once confirmed, you'll receive 
                    an email with your booking details. This typically takes less than a minute.
                  </p>
                  <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-2">
                    Reference: <span className="font-mono">{booking.confirmationNumber}</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col sm:flex-row gap-4 mt-8">
            <Button 
              variant="outline" 
              className="flex-1 gap-2"
              onClick={() => navigate("/")}
            >
              <Home className="h-4 w-4" />
              Return Home
            </Button>
            <Button 
              className="flex-1 gap-2"
              onClick={() => {
                if (isClient && typeof window !== 'undefined') {
                  window.location.reload();
                } else {
                  navigate('/');
                }
              }}
            >
              <Loader2 className="h-4 w-4" />
              Check Status
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (booking?.status === "failed") {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-gradient-to-b from-red-50 to-background dark:from-red-950/20 dark:to-background py-12">
          <div className="container mx-auto px-4 text-center">
            <div className="bg-red-100 dark:bg-red-900/30 rounded-md p-6 w-fit mx-auto mb-6">
              <AlertTriangle className="h-16 w-16 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Payment Failed</h1>
            <p className="text-muted-foreground text-lg">
              Your payment could not be processed. Please try again.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <Button 
            className="w-full gap-2"
            onClick={() => navigate("/")}
          >
            <Home className="h-4 w-4" />
            Return Home and Try Again
          </Button>
        </div>
      </div>
    );
  }

  // ENTERPRISE: Only show success when webhook has confirmed payment
  return (
    <div className="min-h-screen bg-background">
        {booking?.userId && booking?.status === "succeeded" && <TenantTrackingScripts userId={booking.userId} event="purchase" value={booking.amount} />}
      <div className="bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background py-12">
        <div className="container mx-auto px-4 text-center">
          <div className="bg-gray-100 dark:bg-gray-900/30 rounded-md p-6 w-fit mx-auto mb-6">
            <CheckCircle2 className="h-16 w-16 text-gray-600 dark:text-gray-400" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Payment Confirmed!</h1>
          <p className="text-muted-foreground text-lg">
            Your booking has been confirmed with {booking?.businessName}
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Booking Confirmation</span>
              <span className="text-sm font-mono bg-muted px-3 py-1 rounded">
                #{booking?.confirmationNumber}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold mb-3">{booking?.serviceName}</h3>
              
              <div className="grid gap-3">
                {booking?.scheduledDate && (
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(new Date(booking.scheduledDate + "T00:00:00"), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                )}
                
                {booking?.scheduledTime && (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{booking.scheduledTime}</span>
                  </div>
                )}
                
                {booking?.vehicleInfo && (
                  <div className="flex items-center gap-3 text-sm">
                    <Car className="h-4 w-4 text-muted-foreground" />
                    <span>{booking.vehicleInfo}</span>
                  </div>
                )}
              </div>
            </div>

            {booking && booking.amount > 0 && (
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Amount Paid</span>
                  <span className="text-2xl font-bold text-primary">
                    {booking.currency === "USD" ? "$" : booking.currency} 
                    {formatMoney(booking.amount)}
                  </span>
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>
                  Confirmation sent to <strong>{booking?.customerEmail}</strong>
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <h3 className="font-semibold mb-4">What happens next?</h3>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <div className="bg-primary text-primary-foreground rounded-md w-6 h-6 flex items-center justify-center text-xs shrink-0">1</div>
                <span>You'll receive a confirmation email with your booking details</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="bg-primary text-primary-foreground rounded-md w-6 h-6 flex items-center justify-center text-xs shrink-0">2</div>
                <span>A reminder will be sent before your appointment</span>
              </li>
              <li className="flex items-start gap-3">
                <div className="bg-primary text-primary-foreground rounded-md w-6 h-6 flex items-center justify-center text-xs shrink-0">3</div>
                <span>Arrive at your scheduled time or wait for pickup if selected</span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Button 
            variant="outline" 
            className="flex-1 gap-2"
            onClick={() => navigate("/")}
          >
            <Home className="h-4 w-4" />
            Return Home
          </Button>
          <Button 
            className="flex-1 gap-2"
            onClick={() => {
              if (isClient && typeof window !== 'undefined') {
                window.print();
              }
            }}
          >
            Print Confirmation
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8">
          Questions about your booking? Contact {booking?.businessName} directly.
        </p>
      </div>
    </div>
  );
}
