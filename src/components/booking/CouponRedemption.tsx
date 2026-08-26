import { useState } from "react";
import { validateCouponCode } from "@/application/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Tag, Check, X, Percent, DollarSign } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  description: string | null;
}

interface CouponRedemptionProps {
  businessUserId: string;
  subtotal: number;
  onCouponApplied: (coupon: AppliedCoupon | null) => void;
  appliedCoupon: AppliedCoupon | null;
  formatCurrency: (amount: number) => string;
}

export const CouponRedemption = ({
  businessUserId,
  subtotal,
  onCouponApplied,
  appliedCoupon,
  formatCurrency,
}: CouponRedemptionProps) => {
  const [couponCode, setCouponCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateDiscount = (coupon: AppliedCoupon): number => {
    if (coupon.discount_type === "percentage") {
      return (subtotal * coupon.discount_value) / 100;
    }
    return Math.min(coupon.discount_value, subtotal);
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) {
      setError("Please enter a coupon code");
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const validatedCoupon = await validateCouponCode(
        businessUserId,
        couponCode,
        subtotal,
        formatCurrency,
      );

      const applied: AppliedCoupon = {
        id: validatedCoupon.id,
        code: validatedCoupon.code,
        discount_type: validatedCoupon.discount_type,
        discount_value: validatedCoupon.discount_value,
        description: validatedCoupon.description,
      };

      onCouponApplied(applied);
      toast.success(`Coupon "${validatedCoupon.code}" applied!`);
      setCouponCode("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to validate coupon. Please try again.";
      setError(message);
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    onCouponApplied(null);
    setCouponCode("");
    setError(null);
    toast.info("Coupon removed");
  };

  if (appliedCoupon) {
    const discountAmount = calculateDiscount(appliedCoupon);
    
    return (
      <Card className="border-gray-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-md bg-gray-100 dark:bg-green-900/50 flex items-center justify-center">
                <Check className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="font-medium text-gray-800 dark:text-green-200 flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  {appliedCoupon.code}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {appliedCoupon.discount_type === "percentage" 
                    ? `${appliedCoupon.discount_value}% off` 
                    : `${formatCurrency(appliedCoupon.discount_value)} off`
                  }
                  {" · "}
                  You save {formatCurrency(discountAmount)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveCoupon}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="py-4">
        <Label htmlFor="coupon-code" className="text-sm font-medium flex items-center gap-2 mb-2">
          <Tag className="h-4 w-4" />
          Have a coupon code or loyalty phone number?
        </Label>
        <div className="flex gap-2">
          <Input
            id="coupon-code"
            value={couponCode}
            onChange={(e) => {
              const raw = e.target.value;
              // Only uppercase letters; keep digits and punctuation intact so
              // customers can type a phone number here (e.g. 555-123-4567).
              const looksLikePhone = /^[\d\s\-().+]+$/.test(raw.trim());
              setCouponCode(looksLikePhone ? raw : raw.toUpperCase());
              setError(null);
            }}
            placeholder="Coupon code or phone number"
            className={cn(
              error && "border-red-500 focus-visible:ring-red-500"
            )}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApplyCoupon();
              }
            }}
          />
          <Button
            onClick={handleApplyCoupon}
            disabled={validating || !couponCode.trim()}
            variant="outline"
          >
            {validating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Apply"
            )}
          </Button>
        </div>
        {error && (
          <p className="text-sm text-red-500 mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
};

// Helper function to calculate discount amount
export const calculateCouponDiscount = (
  coupon: AppliedCoupon | null,
  subtotal: number
): number => {
  if (!coupon) return 0;
  
  if (coupon.discount_type === "percentage") {
    return (subtotal * coupon.discount_value) / 100;
  }
  return Math.min(coupon.discount_value, subtotal);
};
