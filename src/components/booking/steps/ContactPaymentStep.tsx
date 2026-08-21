/**
 * ContactPaymentStep - Step 6: Contact & Payment Information
 * Handles customer details, payment option selection, and booking summary sidebar.
 */

import { memo } from "react";
import { User, Mail, Calendar as CalendarIcon, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckoutErrorAlert, CheckoutErrorType } from "@/components/booking/CheckoutErrors";
import { CustomerAccountPrompt } from "@/components/booking/CustomerAccountPrompt";
import { PaymentOptions } from "@/components/booking/PaymentOptions";
import CustomerAuth from "@/pages/CustomerAuth";
import { SplitPhoneInput } from "@/components/ui/split-phone-input";
import { format } from "date-fns";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import type { VehicleServiceSelection } from "@/hooks/useBookingState";
import { buildAppointmentBookingConfiguration } from "@/lib/booking-configuration";
import type { DetailingQuoteResult } from "@/lib/detailing-pricing";
import { calculateExtraOilQuarts } from "@/lib/oilCapacity";

interface ServiceCatalogItem {
  id: string;
  name: string;
  default_price: number;
}

interface TaxData {
  tax_amount: number;
  total: number;
  tax_breakdown: Array<{ jurisdiction: string; rate: number; amount: number }>;
}

interface CheckoutFees { wasteOilFee: number; shopFee: number; surcharge: number; }
interface CheckoutFeeSettings { shop_fee_description: string; surcharge_description: string; }

interface ContactPaymentStepProps {
  // Contact fields
  guestName: string;
  setGuestName: (name: string) => void;
  guestEmail: string;
  setGuestEmail: (email: string) => void;
  guestPhone: string;
  setGuestPhone: (phone: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  // Email verification flow
  emailVerified: boolean;
  setEmailVerified: (verified: boolean) => void;
  // Payment
  paymentChoice: "pay_now" | "pay_later";
  setPaymentChoice: (choice: "pay_now" | "pay_later") => void;
  transactionalSmsConsent: boolean;
  setTransactionalSmsConsent: (value: boolean) => void;
  /** Marketing consents are collected outside this step (opt-in only). */
  marketingSmsConsent?: boolean;
  setMarketingSmsConsent?: (value: boolean) => void;
  marketingEmailConsent?: boolean;
  setMarketingEmailConsent?: (value: boolean) => void;
  processingPayment: boolean;
  paymentsEnabled: boolean;
  paymentProviderName: string;
  // Business context
  businessUserId: string;
  businessName: string;
  // Booking data for summary
  vehicles: VehicleData[];
  selectedServices: ServiceCatalogItem[];
  vehicleServiceSelections: Record<string, VehicleServiceSelection>;
  selectedDate: Date | undefined;
  selectedTime: string;
  customerAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  // Pricing
  taxData: TaxData | null;
  getGrandTotal: () => number;
  formatCurrency: (amount: number) => string;
  oilPricePerQuart: number;
  getPreTaxTotal: () => number;
  feeBreakdown: CheckoutFees;
  feeSettings?: CheckoutFeeSettings;
  // Actions
  onPayNow: () => Promise<void>;
  // Error handling
  checkoutError: { type: CheckoutErrorType; message?: string } | null;
  setCheckoutError: (error: { type: CheckoutErrorType; message?: string } | null) => void;
  setStep: (step: number) => void;
  // Auth dialog
  showAuthDialog: boolean;
  setShowAuthDialog: (show: boolean) => void;
  authMode: "signin" | "signup";
  setAuthMode: (mode: "signin" | "signup") => void;
  onAuthSuccess: () => void;
  onCreateAccount?: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  // Retry handler for submit (pay_later path)
  onSubmitRetry?: () => void;
  // Detailing (vertical-specific quote adjustments)
  detailingQuote?: DetailingQuoteResult | null;
  quoteRequired?: boolean;
}

/** ⚡ Memoized — large form with payment options, sidebar summary */
export const ContactPaymentStep = memo(function ContactPaymentStep({
  guestName,
  setGuestName,
  guestEmail,
  setGuestEmail,
  guestPhone,
  setGuestPhone,
  notes,
  setNotes,
  emailVerified,
  setEmailVerified,
  paymentChoice,
  setPaymentChoice,
  transactionalSmsConsent,
  setTransactionalSmsConsent,
  processingPayment,
  paymentsEnabled,
  paymentProviderName,
  businessUserId,
  businessName,
  vehicles,
  selectedServices,
  vehicleServiceSelections,
  selectedDate,
  selectedTime,
  customerAddress,
  addressLine2,
  city,
  state,
  zipCode,
  taxData,
  getGrandTotal,
  formatCurrency,
  oilPricePerQuart,
  getPreTaxTotal,
  feeBreakdown,
  feeSettings,
  onPayNow,
  checkoutError,
  setCheckoutError,
  setStep,
  showAuthDialog,
  setShowAuthDialog,
  authMode,
  setAuthMode,
  onAuthSuccess,
  onCreateAccount,
  onSubmitRetry,
  detailingQuote,
  quoteRequired,
}: ContactPaymentStepProps) {
  const effectiveTaxRate = taxData
    ? taxData.tax_breakdown.reduce((sum, tax) => sum + tax.rate, 0)
    : 0;
  const configuration = buildAppointmentBookingConfiguration(vehicles, vehicleServiceSelections);
  const vehicleSummary = vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model).map((vehicle) => {
    const selection = vehicleServiceSelections[vehicle.id] || { services: [], package: null };
    const lines = selection.package
      ? [{ id: `package-${selection.package.id}`, name: selection.package.name, price: Number(selection.package.package_price), detail: selection.package.services.map((service) => service.name).join(", ") }]
      : selection.services.map((service) => ({ id: service.id, name: service.name, price: Number(service.default_price), detail: "" }));
    const configured = configuration.vehicles.find((item) => item.clientVehicleId === vehicle.id);
    const allServiceNames = lines.map((line) => line.name).join(" ").toLowerCase();
    const extraQuarts = allServiceNames.includes("oil") && (vehicle.oilCapacitySource === "db" || vehicle.oilCapacitySource === "ai" || vehicle.oilCapacitySource === "manual") ? calculateExtraOilQuarts(vehicle.oilCapacity) : 0;
    if (extraQuarts > 0) lines.push({ id: `${vehicle.id}-oil-extra`, name: "Additional oil quarts", price: extraQuarts * oilPricePerQuart, detail: `${extraQuarts} qt × ${formatCurrency(oilPricePerQuart)}` });
    const tireTotal = configured?.tire?.unitPrice ? configured.tire.unitPrice * (configured.tire.frontQuantity + configured.tire.rearQuantity) : 0;
    if (tireTotal > 0) lines.push({ id: `${vehicle.id}-tire-inventory`, name: configured?.tire?.productName || "Tire inventory", price: tireTotal, detail: `${(configured?.tire?.frontQuantity || 0) + (configured?.tire?.rearQuantity || 0)} tire${tireTotal === 1 ? "" : "s"}` });
    return { vehicle, configuration: configured, lines, subtotal: lines.reduce((sum, line) => sum + line.price, 0) };
  });
  const taxLocationLabel = [city, state, zipCode].filter(Boolean).join(" ");

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Complete Your Booking</h2>
          <p className="text-muted-foreground">Enter your details and choose payment</p>
        </div>

        {/* Checkout Error Display */}
        {checkoutError && (
          <div className="mb-6">
            <CheckoutErrorAlert
              errorType={checkoutError.type}
              errorMessage={checkoutError.message}
              onRetry={() => {
                setCheckoutError(null);
                if (paymentChoice === "pay_now" && paymentsEnabled) {
                  onPayNow();
                } else {
                  onSubmitRetry?.();
                }
              }}
              onGoBack={() => {
                setCheckoutError(null);
                if (checkoutError.type === 'provider_not_enabled') {
                  setPaymentChoice("pay_later");
                }
              }}
              onSelectNewTime={() => {
                setCheckoutError(null);
                setStep(4);
              }}
              onReviewPricing={() => {
                setCheckoutError(null);
                setStep(5);
              }}
            />
          </div>
        )}

        {/* Email-first flow */}
        {!emailVerified ? (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <CustomerAccountPrompt
                email={guestEmail}
                onEmailChange={setGuestEmail}
                onContinueAsGuest={(prefillData) => {
                  if (prefillData?.name) {
                    setGuestName(prefillData.name);
                  }
                  setEmailVerified(true);
                }}
                onSignIn={() => {
                  setAuthMode("signin");
                  setShowAuthDialog(true);
                }}
                onCreateAccount={onCreateAccount}
              />
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <User className="h-5 w-5" />
                  Contact Information
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  {guestEmail}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setEmailVerified(false)}
                  >
                    Change
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="John Doe"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="phone">Phone Number <span className="text-destructive">*</span></Label>
                  <div className="mt-1">
                    <SplitPhoneInput
                      id="phone"
                      value={guestPhone}
                      onChange={setGuestPhone}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Special Instructions</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any special requests..."
                    rows={3}
                    className="mt-1"
                  />
                </div>

                {/*
                  One consent checkbox, pre-checked: it covers the terms plus the
                  transactional messages required to service the appointment.
                  Marketing consent is collected separately, never bundled here.
                */}
                <div className="rounded-lg border bg-muted/30 p-4">
                  <label className="flex items-start gap-3 text-sm">
                    <Checkbox
                      checked={transactionalSmsConsent}
                      onCheckedChange={(checked) => setTransactionalSmsConsent(checked === true)}
                      aria-label="Agree to terms and appointment updates"
                    />
                    <span>
                      I agree to the{" "}
                      <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        Terms of Service
                      </a>{" "}
                      and{" "}
                      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        Privacy Policy
                      </a>
                      , and to receive appointment confirmations, reminders, and service updates from{" "}
                      {businessName || "this business"} by email and text. Msg &amp; data rates may apply. Reply STOP to opt out.
                    </span>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Payment Options */}
            <PaymentOptions
              paymentChoice={paymentChoice}
              onPaymentChoiceChange={setPaymentChoice}
              totalAmount={getGrandTotal()}
              taxAmount={taxData?.tax_amount || 0}
              subtotal={getPreTaxTotal()}
              formatCurrency={formatCurrency}
              businessUserId={businessUserId}
              customerEmail={guestEmail}
              customerName={guestName}
              serviceDescription={selectedServices.map(s => s.name).join(", ")}
              onPayNowClick={onPayNow}
              processingPayment={processingPayment}
              stripeEnabled={paymentsEnabled}
              paymentProviderName={paymentProviderName}
            />
          </>
        )}

        {/* Auth Dialog */}
        <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden">
            <CustomerAuth
              providerId={businessUserId}
              providerName={businessName}
              onSuccess={onAuthSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Booking Summary Sidebar */}
      <div>
        <Card className="sticky top-24">
          <CardHeader>
            <CardTitle className="text-lg">Booking Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {vehicleSummary.map(({ vehicle, configuration: configured, lines, subtotal }) => (
                <div key={vehicle.id} className="rounded-lg border bg-muted/20 p-3">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div><p className="font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</p><p className="text-xs text-muted-foreground">{vehicle.licensePlate || "Vehicle service summary"}</p></div>
                    <span className="text-sm font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  {configured?.oil && <p className="mb-1 text-xs text-amber-700">Oil: {[configured.oil.engine, configured.oil.oilType, configured.oil.oilCapacity].filter(Boolean).join(" · ")}</p>}
                  {configured?.tire && <p className="mb-1 text-xs text-primary">Tires: {configured.tire.frontSize} × {configured.tire.frontQuantity}{configured.tire.rearSize ? ` / ${configured.tire.rearSize} × ${configured.tire.rearQuantity}` : ""}{configured.tire.productName ? ` · ${configured.tire.productName}` : ""}</p>}
                  {configured?.detailing && <p className="mb-1 text-xs text-muted-foreground">Detailing: {configured.detailing.vehicleSize} · {configured.detailing.condition} condition</p>}
                  <div className="space-y-1 border-t pt-2">{lines.length > 0 ? lines.map((line) => <div key={line.id} className="flex justify-between gap-3 text-sm"><span>{line.name}{line.detail && <span className="block text-xs text-muted-foreground">{line.detail}</span>}</span><span className="font-medium">{formatCurrency(line.price)}</span></div>) : <p className="text-xs text-muted-foreground">No services assigned</p>}</div>
                </div>
              ))}
              {detailingQuote && detailingQuote.adjustment > 0 && <div className="flex justify-between text-sm"><span>Vehicle size & condition adjustment</span><span className="font-medium">{formatCurrency(detailingQuote.adjustment)}</span></div>}
            </div>

            <div className="border-t pt-3">
              {feeBreakdown.wasteOilFee > 0 && <div className="mb-1 flex justify-between text-sm text-muted-foreground"><span>Waste oil disposal fee</span><span>{formatCurrency(feeBreakdown.wasteOilFee)}</span></div>}
              {feeBreakdown.shopFee > 0 && <div className="mb-1 flex justify-between text-sm text-muted-foreground"><span>{feeSettings?.shop_fee_description || "Shop supplies fee"}</span><span>{formatCurrency(feeBreakdown.shopFee)}</span></div>}
              {feeBreakdown.surcharge > 0 && <div className="mb-1 flex justify-between text-sm text-muted-foreground"><span>{feeSettings?.surcharge_description || "Processing fee"}</span><span>{formatCurrency(feeBreakdown.surcharge)}</span></div>}
              {taxData && (
                <div className="mb-2 flex justify-between text-sm text-muted-foreground">
                  <span>
                    Tax ({effectiveTaxRate.toFixed(2)}% {taxLocationLabel ? `• ${taxLocationLabel}` : ""})
                  </span>
                  <span>{formatCurrency(taxData.tax_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold">
                <span>{detailingQuote?.quoteRequired ? "Starting estimate" : "Total"}</span>
                <span className="text-primary">
                  {formatCurrency(getGrandTotal())}
                </span>
              </div>
              {detailingQuote?.quoteRequired && <p className="mt-2 text-xs text-amber-700">Final price requires provider review of the submitted condition assessment. No additional work will begin without approval.</p>}
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span>{selectedDate && format(selectedDate, "EEEE, MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{selectedTime}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{[customerAddress, addressLine2, city, state, zipCode].filter(Boolean).join(", ")}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
