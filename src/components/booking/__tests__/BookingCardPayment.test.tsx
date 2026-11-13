import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { loadStripe } from "@stripe/stripe-js";
import { BookingCardPayment } from "@/components/booking/BookingCardPayment";
import { nextApi, ApiClientError } from "@/lib/nextApiClient";

// BookingCardPayment — the in-page Stripe Elements step that runs after a
// public booking exists. These tests pin the contract from build report
// §7: intent is requested only with { appointment_id, email }; the 404
// invoice-sequencing race is retried; Elements mounts with the returned
// client_secret and the stripeAccount option in Connect mode; the card is
// confirmed client-side first and settled ONLY through the confirm
// endpoint; the pair's error shapes surface honestly.

jest.mock("@stripe/stripe-js", () => ({
  loadStripe: jest.fn(),
}));

const SLUG = "momsoilchange";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const EMAIL = "guest@example.com";

const createPaymentIntent = nextApi.publicBooking.createPaymentIntent as jest.Mock;
const confirmPaymentIntent = nextApi.publicBooking.confirmPaymentIntent as jest.Mock;
const loadStripeMock = loadStripe as jest.Mock;

const fakePaymentElement = {
  mount: jest.fn(),
  destroy: jest.fn(),
  on: jest.fn((_event: string, cb: () => void) => cb()),
};
const fakeElements = {
  create: jest.fn(() => fakePaymentElement),
  submit: jest.fn(async () => ({})),
};
const fakeStripe = {
  elements: jest.fn(() => fakeElements),
  confirmPayment: jest.fn(),
};

function connectIntent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      payment_id: "66666666-6666-4666-8666-666666666666",
      client_secret: "pi_123_secret_abc",
      amount: 112.03,
      currency: "usd",
      mode: "connect",
      stripe_account_id: "acct_test",
      publishable_key: "pk_test_platform",
      reused: false,
      ...overrides,
    },
  };
}

function renderPayment(props: Partial<React.ComponentProps<typeof BookingCardPayment>> = {}) {
  const onSettled = jest.fn();
  const onContinueWithoutOnlinePayment = jest.fn();
  render(
    <BookingCardPayment
      slug={SLUG}
      appointmentId={APPOINTMENT_ID}
      email={EMAIL}
      formatCurrency={(n) => `$${n.toFixed(2)}`}
      onSettled={onSettled}
      onContinueWithoutOnlinePayment={onContinueWithoutOnlinePayment}
      invoiceRetryDelayMs={0}
      {...props}
    />,
  );
  return { onSettled, onContinueWithoutOnlinePayment };
}

beforeEach(() => {
  jest.clearAllMocks();
  fakeElements.submit.mockResolvedValue({});
  loadStripeMock.mockResolvedValue(fakeStripe);
});

describe("BookingCardPayment", () => {
  it("retries the invoice-sequencing 404, then mounts Elements with the client_secret and stripeAccount in Connect mode", async () => {
    createPaymentIntent
      .mockRejectedValueOnce(new ApiClientError(404, "payment_invoice_not_found", "No billable invoice exists for this booking yet."))
      .mockResolvedValueOnce(connectIntent());

    renderPayment();

    const payButton = await screen.findByRole("button", { name: /Pay \$112\.03 Now/ });
    expect(createPaymentIntent).toHaveBeenCalledTimes(2);
    expect(createPaymentIntent).toHaveBeenCalledWith(SLUG, {
      appointment_id: APPOINTMENT_ID,
      email: EMAIL,
    });
    expect(loadStripeMock).toHaveBeenCalledWith("pk_test_platform", { stripeAccount: "acct_test" });
    expect(fakeStripe.elements).toHaveBeenCalledWith({ clientSecret: "pi_123_secret_abc" });
    expect(fakeElements.create).toHaveBeenCalledWith("payment");
    expect(fakePaymentElement.mount).toHaveBeenCalled();
    await waitFor(() => expect(payButton).not.toBeDisabled());
  });

  it("confirms the card client-side, then settles through the confirm endpoint before reporting settled", async () => {
    createPaymentIntent.mockResolvedValue(connectIntent());
    fakeStripe.confirmPayment.mockResolvedValue({
      paymentIntent: { id: "pi_123", status: "succeeded" },
    });
    confirmPaymentIntent.mockResolvedValue({
      data: { success: true, settled: true, payment_id: "66666666-6666-4666-8666-666666666666" },
    });

    const { onSettled } = renderPayment();
    const payButton = await screen.findByRole("button", { name: /Pay \$112\.03 Now/ });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    await waitFor(() => expect(onSettled).toHaveBeenCalledTimes(1));
    expect(fakeElements.submit).toHaveBeenCalled();
    expect(fakeStripe.confirmPayment).toHaveBeenCalledWith(
      expect.objectContaining({ clientSecret: "pi_123_secret_abc", redirect: "if_required" }),
    );
    expect(confirmPaymentIntent).toHaveBeenCalledWith(SLUG, {
      appointment_id: APPOINTMENT_ID,
      email: EMAIL,
      payment_intent_id: "pi_123",
    });
  });

  it("surfaces a card error and never calls the confirm endpoint or reports settled", async () => {
    createPaymentIntent.mockResolvedValue(connectIntent());
    fakeStripe.confirmPayment.mockResolvedValue({
      error: { message: "Your card was declined." },
    });

    const { onSettled } = renderPayment();
    const payButton = await screen.findByRole("button", { name: /Pay \$112\.03 Now/ });
    await waitFor(() => expect(payButton).not.toBeDisabled());
    fireEvent.click(payButton);

    expect(await screen.findByText("Your card was declined.")).toBeInTheDocument();
    expect(confirmPaymentIntent).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("shows the honest unavailable state on the 402 add-on gate and lets the guest continue to pay at service", async () => {
    createPaymentIntent.mockRejectedValue(
      new ApiClientError(402, "payments_addon_required", "The Payments add-on is not active for this workspace."),
    );

    const { onContinueWithoutOnlinePayment } = renderPayment();

    expect(
      await screen.findByText(/Online card payment isn't available for this business right now/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continue — pay at time of service/ }));
    expect(onContinueWithoutOnlinePayment).toHaveBeenCalledTimes(1);
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it("shows the unavailable state in direct mode, where no publishable key exists server-side", async () => {
    createPaymentIntent.mockResolvedValue(
      connectIntent({ mode: "direct", stripe_account_id: null, publishable_key: null }),
    );

    renderPayment();

    expect(
      await screen.findByText(/Online card payment isn't available for this business right now/),
    ).toBeInTheDocument();
    expect(loadStripeMock).not.toHaveBeenCalled();
  });
});
