import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type Stripe,
  type StripeElements,
  type StripePaymentElement,
} from "@stripe/stripe-js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, Lock, Shield } from "lucide-react";
import { nextApi, ApiClientError } from "@/lib/nextApiClient";

/**
 * BookingCardPayment — in-page card payment for a public booking.
 *
 * Runs AFTER the booking exists (the appointment's invoice is created by
 * database triggers, so the payment-intent call may briefly 404 with
 * `payment_invoice_not_found` while the invoice lands — that one code is
 * retried, every other error is surfaced as-is).
 *
 * Nothing here trusts the client: the amount comes from the server-side
 * invoice balance, and "settled" is only ever reported after the
 * confirm endpoint re-reads the intent from Stripe and verifies the
 * binding + amount server-side.
 */

interface BookingCardPaymentProps {
  slug: string;
  appointmentId: string;
  email: string;
  formatCurrency: (amount: number) => string;
  /** Payment settled and verified server-side. */
  onSettled: () => void;
  /** Guest continues without paying online (booking stands; pay at service / payment still processing). */
  onContinueWithoutOnlinePayment: () => void;
  /** Test seam: delay between payment_invoice_not_found retries. */
  invoiceRetryDelayMs?: number;
}

type Phase =
  | "creating-intent"
  | "ready"
  | "confirming"
  | "processing"
  | "unavailable"
  | "error";

const INVOICE_RETRY_ATTEMPTS = 8;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BookingCardPayment({
  slug,
  appointmentId,
  email,
  formatCurrency,
  onSettled,
  onContinueWithoutOnlinePayment,
  invoiceRetryDelayMs = 1500,
}: BookingCardPaymentProps) {
  const [phase, setPhase] = useState<Phase>("creating-intent");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [elementReady, setElementReady] = useState(false);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const clientSecretRef = useRef<string | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const elementMountedRef = useRef(false);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  const startPayment = useCallback(async () => {
    setPhase("creating-intent");
    setErrorMessage(null);

    // Step 1: create (or reuse) the PaymentIntent. The 404 code is the
    // invoice-sequencing race — retry it briefly; all other failures are
    // real answers and are shown, never retried into a fake success.
    let intent: Awaited<ReturnType<typeof nextApi.publicBooking.createPaymentIntent>>["data"] | null = null;
    for (let attempt = 0; attempt < INVOICE_RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await nextApi.publicBooking.createPaymentIntent(slug, {
          appointment_id: appointmentId,
          email,
        });
        intent = response.data;
        break;
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === "payment_invoice_not_found" &&
          attempt < INVOICE_RETRY_ATTEMPTS - 1
        ) {
          await delay(invoiceRetryDelayMs);
          continue;
        }
        if (error instanceof ApiClientError && error.status === 402) {
          // Payments add-on not active for this workspace.
          setPhase("unavailable");
          return;
        }
        if (
          error instanceof ApiClientError &&
          (error.code === "payment_nothing_due" || error.code === "payment_already_paid")
        ) {
          // Server says there is nothing (left) to collect — that is a
          // settled state, verified by the server, not assumed here.
          onSettled();
          return;
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "We couldn't start the payment. Please try again.",
        );
        setPhase("error");
        return;
      }
    }
    if (!intent) {
      setErrorMessage(
        "Your booking's invoice is still being prepared. Please wait a moment and try again.",
      );
      setPhase("error");
      return;
    }

    setAmount(intent.amount);

    // Step 2: mount Elements. Connect workspaces carry everything the
    // browser needs in the response; direct-mode workspaces keep their
    // publishable key in their own Stripe dashboard (not stored
    // server-side), so the honest answer is "not available here".
    if (!intent.publishable_key || (intent.mode === "connect" && !intent.stripe_account_id)) {
      setPhase("unavailable");
      return;
    }

    try {
      const stripe = await loadStripe(
        intent.publishable_key,
        intent.mode === "connect" && intent.stripe_account_id
          ? { stripeAccount: intent.stripe_account_id }
          : undefined,
      );
      if (!stripe) throw new Error("Stripe failed to load.");
      const elements = stripe.elements({ clientSecret: intent.client_secret });
      stripeRef.current = stripe;
      elementsRef.current = elements;
      clientSecretRef.current = intent.client_secret;
      // The mount node only exists once the "ready" phase renders, so the
      // element is created here and mounted by the effect below.
      paymentElementRef.current = elements.create("payment");
      elementMountedRef.current = false;
      setElementReady(false);
      setPhase("ready");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "We couldn't load the card form. Please try again.",
      );
      setPhase("error");
    }
  }, [slug, appointmentId, email, invoiceRetryDelayMs, onSettled]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startPayment();
  }, [startPayment]);

  // Mount the Payment Element once the "ready" phase has rendered its
  // mount node (it does not exist during "creating-intent").
  useEffect(() => {
    if (phase !== "ready" || elementMountedRef.current) return;
    const paymentElement = paymentElementRef.current;
    if (!paymentElement || !mountRef.current) return;
    paymentElement.mount(mountRef.current);
    paymentElement.on("ready", () => setElementReady(true));
    elementMountedRef.current = true;
  }, [phase]);

  const handlePay = useCallback(async () => {
    const stripe = stripeRef.current;
    const elements = elementsRef.current;
    const clientSecret = clientSecretRef.current;
    if (!stripe || !elements || !clientSecret) return;

    setPhase("confirming");
    setErrorMessage(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message || "Please check your card details and try again.");
      setPhase("ready");
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      clientSecret,
      redirect: "if_required",
      confirmParams: {
        return_url: typeof window !== "undefined" ? window.location.href : "",
      },
    });

    if (result.error) {
      setErrorMessage(result.error.message || "Your card could not be charged. Please try again.");
      setPhase("ready");
      return;
    }

    const paymentIntent = result.paymentIntent;
    if (!paymentIntent) {
      setErrorMessage("We couldn't confirm the payment result. Please try again.");
      setPhase("ready");
      return;
    }

    if (paymentIntent.status === "processing") {
      // The charge is in flight at the bank. Webhooks reconcile the
      // invoice server-side; never tell the guest to pay again.
      setPhase("processing");
      return;
    }

    if (paymentIntent.status !== "succeeded") {
      setErrorMessage(
        "The payment didn't complete. Please try again, or continue and pay at time of service.",
      );
      setPhase("ready");
      return;
    }

    // Step 3: settle server-side. The endpoint re-reads the intent from
    // Stripe and verifies binding + amount before marking anything paid.
    try {
      const response = await nextApi.publicBooking.confirmPaymentIntent(slug, {
        appointment_id: appointmentId,
        email,
        payment_intent_id: paymentIntent.id,
      });
      if (response.data.settled || response.data.already_recorded) {
        onSettled();
        return;
      }
      setErrorMessage(
        "Stripe accepted the payment but it hasn't settled yet. Your booking is confirmed — if it completes, you won't owe anything at your appointment.",
      );
      setPhase("processing");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We couldn't verify the payment. Please contact the shop before paying again.",
      );
      setPhase("error");
    }
  }, [slug, appointmentId, email, onSettled]);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CreditCard className="h-5 w-5" />
          Complete your payment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your booking is confirmed. Pay now to finish
            {amount !== null ? (
              <>
                {" "}— <span className="font-semibold text-foreground">{formatCurrency(amount)}</span>
              </>
            ) : null}
            .
          </p>

          {phase === "creating-intent" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing secure payment…
            </div>
          )}

          {phase === "unavailable" && (
            <div className="space-y-4">
              <p className="text-sm">
                Online card payment isn't available for this business right now. Your booking is
                confirmed — you can pay at time of service instead.
              </p>
              <Button className="w-full" size="lg" onClick={onContinueWithoutOnlinePayment}>
                Continue — pay at time of service
              </Button>
            </div>
          )}

          {phase === "processing" && (
            <div className="space-y-4">
              <p className="text-sm">
                Your payment is processing. Your booking is confirmed, and if the payment
                completes you won't owe anything at your appointment — please don't pay twice.
              </p>
              {errorMessage && <p className="text-sm text-muted-foreground">{errorMessage}</p>}
              <Button className="w-full" size="lg" onClick={onContinueWithoutOnlinePayment}>
                Done
              </Button>
            </div>
          )}

          {phase === "error" && (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={() => {
                  startedRef.current = true;
                  void startPayment();
                }}
              >
                Try again
              </Button>
              <Button className="w-full" size="lg" onClick={onContinueWithoutOnlinePayment}>
                Continue — pay at time of service
              </Button>
            </div>
          )}

          {(phase === "ready" || phase === "confirming") && (
            <>
              <div ref={mountRef} data-testid="stripe-payment-element" />
              {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handlePay}
                disabled={!elementReady || phase === "confirming"}
              >
                {phase === "confirming" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Pay{amount !== null ? ` ${formatCurrency(amount)}` : ""} Now
                  </>
                )}
              </Button>
              <button
                type="button"
                className="w-full text-center text-sm text-muted-foreground underline"
                onClick={onContinueWithoutOnlinePayment}
              >
                Skip — pay at time of service instead
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>Secure payment powered by Stripe</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
