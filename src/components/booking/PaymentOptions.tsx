import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { toast } from "sonner";
import { CreditCard, Banknote, Loader2, Shield, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentOptionsProps {
  paymentChoice: "pay_now" | "pay_later";
  onPaymentChoiceChange: (choice: "pay_now" | "pay_later") => void;
  totalAmount: number;
  taxAmount: number;
  subtotal: number;
  surchargeAmount?: number;
  surchargeDescription?: string;
  formatCurrency: (amount: number) => string;
  businessUserId: string;
  customerEmail: string;
  customerName: string;
  serviceDescription: string;
  onPayNowClick: () => void;
  processingPayment: boolean;
  stripeEnabled: boolean;
  paymentProviderName?: string;
}

export function PaymentOptions({
  paymentChoice,
  onPaymentChoiceChange,
  totalAmount,
  taxAmount,
  subtotal,
  surchargeAmount = 0,
  surchargeDescription = "Card Processing Fee",
  formatCurrency,
  businessUserId,
  customerEmail,
  customerName,
  serviceDescription,
  onPayNowClick,
  processingPayment,
  stripeEnabled,
  paymentProviderName = "Stripe",
}: PaymentOptionsProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CreditCard className="h-5 w-5" />
            Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={paymentChoice} 
            onValueChange={(v) => onPaymentChoiceChange(v as "pay_now" | "pay_later")}
          >
            <div className="space-y-3">
              {/* Pay Now Option */}
              <label className={cn(
                "flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors",
                paymentChoice === "pay_now" && "border-primary bg-primary/5",
                !stripeEnabled && "opacity-50 cursor-not-allowed"
              )}>
                <RadioGroupItem 
                  value="pay_now" 
                  className="mt-1" 
                  disabled={!stripeEnabled}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <p className="font-medium">Pay Now</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Secure payment via credit/debit card
                  </p>
                  {!stripeEnabled && (
                    <p className="text-xs text-amber-600 mt-1">
                      Online payments not available for this business
                    </p>
                  )}
                </div>
                <span className="font-semibold text-primary">
                  {formatCurrency(totalAmount)}
                </span>
              </label>

              {/* Pay Later Option */}
              <label className={cn(
                "flex items-start gap-4 p-4 rounded-lg border cursor-pointer transition-colors",
                paymentChoice === "pay_later" && "border-primary bg-primary/5"
              )}>
                <RadioGroupItem value="pay_later" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">Pay at Time of Service</p>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Pay with cash or card when service is complete
                  </p>
                </div>
                <span className="font-semibold">
                  {formatCurrency(totalAmount)}
                </span>
              </label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Pay Now Button */}
      {paymentChoice === "pay_now" && stripeEnabled && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {surchargeAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">{surchargeDescription}</span>
                  <span>{formatCurrency(surchargeAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(totalAmount)}</span>
              </div>

              <Button 
                className="w-full gap-2" 
                size="lg"
                onClick={onPayNowClick}
                disabled={processingPayment}
              >
                {processingPayment ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Pay {formatCurrency(totalAmount)} Now
                  </>
                )}
              </Button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                <span>Secure payment powered by {paymentProviderName}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {paymentChoice === "pay_later" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
          <Banknote className="h-4 w-4" />
          <span>You'll pay {formatCurrency(totalAmount)} when your service is complete</span>
        </div>
      )}
    </div>
  );
}
