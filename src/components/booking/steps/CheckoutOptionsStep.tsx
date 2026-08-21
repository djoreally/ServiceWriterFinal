/**
 * CheckoutOptionsStep - Step 5: Service Add-ons & Order Summary
 * Smart upsell area for filters, wipers, and other add-on services.
 * Recommends items not already selected, and allows manual browsing.
 */

import type { DetailingQuoteResult } from "@/lib/detailing-pricing";
import { useState, useEffect, memo } from "react";
import { computeFees as computeFeesFromSettings } from "@/lib/financialMath";
import { FileText, Gift, Loader2, Plus, X, Sparkles, Filter } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { fetchCheckoutCatalog } from "@/application/queries/checkout-catalog.query";
import { CouponRedemption, AppliedCoupon, calculateCouponDiscount } from "@/components/booking/CouponRedemption";
import { lookupBookingRewards, type BookingRewardLookupResult } from "@/application/commands/booking-submit.command";

import { TenantTrackingScripts } from "@/components/tracking/TenantTrackingScripts";
import type { VehicleData } from "@/components/booking/VehicleEntry";

interface ServiceCatalogItem {
  id: string;
  name: string;
  default_price: number;
  description?: string | null;
  category?: string | null;
  is_upsell?: boolean;
}

interface TaxData {
  tax_amount: number;
  total: number;
  tax_breakdown: Array<{ jurisdiction: string; rate: number; amount: number }>;
}

/** Check if a service is flagged as an upsell in the catalog */
function isUpsellService(service: ServiceCatalogItem): boolean {
  return service.is_upsell === true;
}

interface FeeSettings {
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee_type: string;
  shop_fee_value: number;
  shop_fee_description: string;
  surcharge_enabled: boolean;
  surcharge_type: string;
  surcharge_value: number;
  surcharge_description: string;
}

interface CheckoutOptionsStepProps {
  vehicles: VehicleData[];
  selectedServices: ServiceCatalogItem[];
  onAddService: (service: ServiceCatalogItem) => void;
  onRemoveService: (serviceId: string) => void;
  getTotalPrice: () => number;
  getOilPriceAdjustment: () => number;
  /** Optional structured oil breakdown for itemized "N qt × $X" display. */
  getOilPriceBreakdown?: () => { extraQuarts: number; pricePerQuart: number; total: number };
  formatCurrency: (amount: number) => string;
  businessUserId: string;
  guestEmail: string;
  selectedRewardInstanceId: string | null;
  onSelectedRewardInstanceChange: (rewardInstanceId: string | null) => void;
  taxLoading: boolean;
  taxData: TaxData | null;
  appliedCoupon: AppliedCoupon | null;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  feeSettings?: FeeSettings;
  /** Current payment choice — rewards can only be redeemed on pay-at-service today. */
  paymentChoice?: "pay_now" | "pay_later";
  detailingQuote?: DetailingQuoteResult | null;
}

/** ⚡ Memoized — upsell catalog + order summary re-renders are expensive */
export const CheckoutOptionsStep = memo(function CheckoutOptionsStep({
  vehicles,
  selectedServices,
  onAddService,
  onRemoveService,
  getTotalPrice,
  getOilPriceAdjustment,
  getOilPriceBreakdown,
  formatCurrency,
  businessUserId,
  guestEmail,
  selectedRewardInstanceId,
  onSelectedRewardInstanceChange,
  taxLoading,
  taxData,
  appliedCoupon,
  setAppliedCoupon,
  detailingQuote,
  feeSettings,
  paymentChoice,
}: CheckoutOptionsStepProps) {
  const rewardsDisabledForPayNow = paymentChoice === "pay_now";

  // Clear any previously selected reward if the customer switches to Pay Now —
  // reward redemption is not yet wired into the hosted checkout flow, so keeping
  // a selection would mislead the customer into expecting a discount.
  useEffect(() => {
    if (rewardsDisabledForPayNow && selectedRewardInstanceId) {
      onSelectedRewardInstanceChange(null);
    }
  }, [rewardsDisabledForPayNow, selectedRewardInstanceId, onSelectedRewardInstanceChange]);
  const [allCatalogServices, setAllCatalogServices] = useState<ServiceCatalogItem[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [showAllAddons, setShowAllAddons] = useState(false);
  const [rewardsLookup, setRewardsLookup] = useState<BookingRewardLookupResult | null>(null);
  const [loadingRewards, setLoadingRewards] = useState(false);

  // Fetch full service catalog for upsell suggestions
  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true);
      const items = await fetchCheckoutCatalog(businessUserId);
      setAllCatalogServices(items as ServiceCatalogItem[]);
      setLoadingCatalog(false);
    }
    if (businessUserId) loadCatalog();
  }, [businessUserId]);

  useEffect(() => {
    const email = guestEmail.trim();
    if (!businessUserId || !email || !email.includes("@")) {
      setRewardsLookup(null);
      onSelectedRewardInstanceChange(null);
      return;
    }

    let active = true;
    const handle = window.setTimeout(() => {
      setLoadingRewards(true);
      lookupBookingRewards(businessUserId, email)
        .then((result) => {
          if (!active) return;
          setRewardsLookup(result);
          if (!result.available_rewards.some((reward) => reward.instance_id === selectedRewardInstanceId)) {
            onSelectedRewardInstanceChange(null);
          }
        })
        .catch(() => {
          if (active) setRewardsLookup(null);
        })
        .finally(() => {
          if (active) setLoadingRewards(false);
        });
    }, 400);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [businessUserId, guestEmail, selectedRewardInstanceId, onSelectedRewardInstanceChange]);

  const selectedIds = new Set(selectedServices.map(s => s.id));

  // Smart recommendations: upsell services not already selected
  const recommendedAddons = allCatalogServices.filter(
    s => isUpsellService(s) && !selectedIds.has(s.id)
  );

  // All other available add-ons (non-recommended, not selected)
  const otherAddons = allCatalogServices.filter(
    s => !isUpsellService(s) && !selectedIds.has(s.id)
  );

  const subtotal = getTotalPrice();

  // ⚡ Use centralized financial math — all values in DOLLARS (banker's-rounded)
  const fees = computeFeesFromSettings(feeSettings ?? null, subtotal);
  const wasteOilFeeAmount = fees.wasteOilFee;
  const shopFeeAmount = fees.shopFee;
  const surchargeAmount = fees.surcharge;

  return (
    <div className="max-w-lg mx-auto">
      {businessUserId && (
        <TenantTrackingScripts userId={businessUserId} event="begin_checkout" value={subtotal} />
      )}
      <div className="text-center mb-8">
        <Sparkles className="h-12 w-12 mx-auto text-primary mb-4" />
        <h2 className="text-2xl font-bold mb-2">Enhance Your Service</h2>
        <p className="text-muted-foreground">
          Add filters, wipers, or other services to your appointment
        </p>
      </div>

      {/* Smart Recommendations */}
      {loadingCatalog ? (
        <Card className="mb-6">
          <CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recommendations...
          </CardContent>
        </Card>
      ) : recommendedAddons.length > 0 ? (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              Recommended Add-ons
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recommendedAddons.map(addon => (
              <label
                key={addon.id}
                className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50"
              >
                <Checkbox
                  checked={false}
                  onCheckedChange={(checked) => {
                    if (checked) onAddService(addon);
                  }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{addon.name}</p>
                  {addon.description && (
                    <p className="text-xs text-muted-foreground truncate">{addon.description}</p>
                  )}
                </div>
                <span className="text-sm font-semibold whitespace-nowrap">
                  +{formatCurrency(addon.default_price)}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No additional recommendations — you've got great coverage! 🎉
          </CardContent>
        </Card>
      )}

      {/* Currently Added Services (removable) */}
      {selectedServices.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Selected Services</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedServices.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{s.name}</p>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(s.default_price)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveService(s.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Browse All Add-ons */}
      {otherAddons.length > 0 && (
        <div className="mb-6">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowAllAddons(!showAllAddons)}
          >
            <Plus className="h-4 w-4 mr-2" />
            {showAllAddons ? "Hide" : "Browse"} More Services ({otherAddons.length})
          </Button>
          
          {showAllAddons && (
            <Card className="mt-3">
              <CardContent className="pt-4 space-y-2 max-h-64 overflow-y-auto">
                {otherAddons.map(addon => (
                  <label
                    key={addon.id}
                    className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={false}
                      onCheckedChange={(checked) => {
                        if (checked) onAddService(addon);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{addon.name}</p>
                      {addon.category && (
                        <Badge variant="outline" className="text-xs mt-0.5">{addon.category}</Badge>
                      )}
                    </div>
                    <span className="text-sm font-semibold whitespace-nowrap">
                      +{formatCurrency(addon.default_price)}
                    </span>
                  </label>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}


      {/* Booking Rewards Recognition */}
      {businessUserId && guestEmail.trim().includes("@") && (
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" />
              Your rewards
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loadingRewards ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Checking rewards for this email...
              </div>
            ) : rewardsLookup?.status === "matched" ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">{rewardsLookup.points_balance.toLocaleString()} points</Badge>
                  <span className="text-muted-foreground">Matched {rewardsLookup.masked_email || "returning customer"}</span>
                </div>
                {rewardsLookup.available_rewards.length ? (
                  <div className="space-y-2">
                    {rewardsDisabledForPayNow && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
                        Reward redemption isn't supported with online payment yet. Choose <strong>Pay at Time of Service</strong> to apply a reward to this booking.
                      </p>
                    )}
                    {rewardsLookup.available_rewards.map((reward) => (
                      <label
                        key={reward.instance_id || reward.reward_id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border bg-background p-3",
                          rewardsDisabledForPayNow ? "opacity-60 cursor-not-allowed" : "cursor-pointer",
                        )}
                      >
                        <Checkbox
                          checked={!rewardsDisabledForPayNow && selectedRewardInstanceId === reward.instance_id}
                          disabled={rewardsDisabledForPayNow}
                          onCheckedChange={(checked) => {
                            if (rewardsDisabledForPayNow) return;
                            onSelectedRewardInstanceChange(checked ? reward.instance_id || null : null);
                          }}
                        />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{reward.name}</p>
                          <p className="text-xs text-muted-foreground">{reward.description || reward.program_name || "Available loyalty reward"}</p>
                        </div>
                        <Badge>Available</Badge>
                      </label>
                    ))}
                    {!rewardsDisabledForPayNow && (
                      <p className="text-xs text-muted-foreground">Selected rewards are preview-only in this step; final reservation and discount application happen at booking submission.</p>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No issued rewards are available yet.
                    {rewardsLookup.catalog.length ? ` Next reward: ${rewardsLookup.catalog[0].name} (${rewardsLookup.catalog[0].points_remaining?.toLocaleString() || 0} points to go).` : ""}
                  </div>
                )}
              </>
            ) : rewardsLookup?.status === "requires_review" ? (
              <p className="text-sm text-muted-foreground">We found multiple possible reward profiles for this email. Please sign in or ask the shop to review your profile before applying rewards.</p>
            ) : (
              <p className="text-sm text-muted-foreground">No rewards profile found for this email yet. You can still complete booking and earn rewards after service completion.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coupon Redemption */}
      {businessUserId && (
        <CouponRedemption
          businessUserId={businessUserId}
          subtotal={subtotal}
          onCouponApplied={setAppliedCoupon}
          appliedCoupon={appliedCoupon}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {vehicles.length} Vehicle{vehicles.length > 1 ? "s" : ""}
            </span>
            <span>
              {vehicles.filter(v => v.year).map(v => `${v.year} ${v.make}`).join(", ")}
            </span>
          </div>
          {selectedServices.map(s => (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="text-muted-foreground">{s.name}</span>
              <span>{formatCurrency(s.default_price)}</span>
            </div>
          ))}
          {(() => {
            const breakdown = getOilPriceBreakdown?.();
            const oilTotal = breakdown?.total ?? getOilPriceAdjustment();
            if (oilTotal <= 0) return null;
            const qtyLabel =
              breakdown && breakdown.extraQuarts > 0
                ? `${breakdown.extraQuarts} qt × ${formatCurrency(breakdown.pricePerQuart)}`
                : null;
            return (
              <div className="flex justify-between text-sm text-amber-600">
                <span className="flex items-center gap-1">
                  <span className="text-xs">🛢️</span>
                  Additional Oil
                  {qtyLabel && (
                    <span className="text-xs text-muted-foreground">· {qtyLabel}</span>
                  )}
                </span>
                <span>+{formatCurrency(oilTotal)}</span>
              </div>
            );
          })()}
          
          <div className="flex justify-between text-sm pt-2 border-t">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>

          {/* Coupon Discount Display */}
          {appliedCoupon && (
            <div className="flex justify-between text-sm text-gray-600">
              <span className="flex items-center gap-1">
                Discount ({appliedCoupon.code})
              </span>
              <span>-{formatCurrency(calculateCouponDiscount(appliedCoupon, subtotal))}</span>
            </div>
          )}

          {/* Waste Oil Fee */}
          {wasteOilFeeAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Waste Oil Disposal Fee</span>
              <span>{formatCurrency(wasteOilFeeAmount)}</span>
            </div>
          )}

          {/* Shop Fee */}
          {shopFeeAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {feeSettings?.shop_fee_description || "Shop Supplies Fee"}
                {feeSettings?.shop_fee_type === 'percentage' ? ` (${feeSettings.shop_fee_value}%)` : ''}
              </span>
              <span>{formatCurrency(shopFeeAmount)}</span>
            </div>
          )}

          {/* Surcharge */}
          {surchargeAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {feeSettings?.surcharge_description || "Card Processing Fee"}
                {feeSettings?.surcharge_type === 'percentage' ? ` (${feeSettings.surcharge_value}%)` : ''}
              </span>
              <span>{formatCurrency(surchargeAmount)}</span>
            </div>
          )}
          
          {taxLoading ? (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                Calculating tax...
              </span>
            </div>
          ) : taxData ? (
            <>
              {taxData.tax_breakdown.map((tax, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {tax.jurisdiction} ({tax.rate.toFixed(2)}%)
                  </span>
                  <span>{formatCurrency(tax.amount)}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="text-muted-foreground text-xs">Tax rate shown after address validation</span>
            </div>
          )}
          
          <div className="border-t pt-3 flex justify-between font-semibold">
            <span>Estimated Total</span>
            <span className="text-primary">
              {(() => {
                const discount = calculateCouponDiscount(appliedCoupon, subtotal);
                const afterDiscount = subtotal - discount;
                const feesTotal = wasteOilFeeAmount + shopFeeAmount + surchargeAmount;
                if (taxData) {
                  const taxRate = taxData.tax_breakdown.reduce((sum, t) => sum + t.rate, 0) / 100;
                  const estimatedTax = (afterDiscount + feesTotal) * taxRate;
                  return formatCurrency(afterDiscount + feesTotal + estimatedTax);
                }
                return formatCurrency(afterDiscount + feesTotal);
              })()}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
