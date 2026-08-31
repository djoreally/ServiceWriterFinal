import { errorCode } from "@/lib/error-message";
import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchPaymentSettings,
  type PaymentSettingsData,
  type CouponCode,
} from "@/application/queries/payment-settings.query";
import {
  savePaymentSettings as savePaymentSettingsApi,
  saveCoupon as saveCouponApi,
  deleteCoupon as deleteCouponApi,
  toggleCouponActive as toggleCouponActiveApi,
} from "@/application/commands/payment-settings.command";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Percent,
  Tag,
  Plus,
  Trash2,
  Edit2,
  Save,
  Loader2,
  Receipt,
  Copy,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  Droplets,
  Wrench,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { bankersRound, formatMoney } from "@/lib/financialMath";
import { format } from "date-fns";
import { PhoneCouponsAdmin } from "./PhoneCouponsAdmin";

// Types imported from application layer

export const PaymentSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PaymentSettingsData>({
    accept_deposits: false,
    deposit_percentage: 20,
    tax_rate: 0,
    oil_price_per_quart: 4,
    surcharge_enabled: false,
    surcharge_type: "percentage",
    surcharge_value: 3.0,
    surcharge_description: "Card Processing Fee",
    waste_oil_fee_enabled: false,
    waste_oil_fee: 0,
    shop_fee_enabled: false,
    shop_fee_type: "fixed",
    shop_fee_value: 0,
    shop_fee_description: "Shop Supplies Fee",
    phone_as_coupon_enabled: false,
    phone_coupon_discount_type: "percentage",
    phone_coupon_discount_value: 10,
    phone_coupon_min_order_amount: 0,
    phone_coupon_description: "Loyalty discount",
  });
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [couponDialogOpen, setCouponDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<CouponCode | null>(null);
  const [couponForm, setCouponForm] = useState({
    code: "",
    description: "",
    discount_type: "percentage",
    discount_value: 10,
    min_order_amount: 0,
    max_uses: null as number | null,
    valid_until: "",
  });
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);


  const fetchData = async () => {
    try {
      const { settings: s, coupons: c } = await fetchPaymentSettings();
      setSettings(s);
      setCoupons(c);
    } catch (e) {
      console.error("Error fetching payment settings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await savePaymentSettingsApi(settings);
      toast.success("Payment settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
    setSaving(false);
  };

  const handleSaveCoupon = async () => {
    if (!couponForm.code.trim()) {
      toast.error("Please enter a coupon code");
      return;
    }

    setSavingCoupon(true);
    try {
      await saveCouponApi({
        code: couponForm.code.toUpperCase().replace(/\s/g, ""),
        description: couponForm.description || null,
        discount_type: couponForm.discount_type,
        discount_value: couponForm.discount_value,
        min_order_amount: couponForm.min_order_amount || 0,
        max_uses: couponForm.max_uses || null,
        valid_until: couponForm.valid_until ? new Date(couponForm.valid_until).toISOString() : null,
      }, editingCoupon?.id);

      toast.success(editingCoupon ? "Coupon updated" : "Coupon created");
      setCouponDialogOpen(false);
      fetchData();
    } catch (error: unknown) {
      if (errorCode(error) === "23505") {
        toast.error("A coupon with this code already exists");
      } else {
        toast.error(editingCoupon ? "Failed to update coupon" : "Failed to create coupon");
      }
    }
    setSavingCoupon(false);
  };

  const handleDeleteCoupon = async (id: string) => {
    try {
      await deleteCouponApi(id);
      toast.success("Coupon deleted");
      setCoupons(coupons.filter((c) => c.id !== id));
    } catch {
      toast.error("Failed to delete coupon");
    }
  };

  const handleToggleCoupon = async (id: string, isActive: boolean) => {
    try {
      await toggleCouponActiveApi(id, isActive);
      setCoupons(coupons.map((c) => (c.id === id ? { ...c, is_active: isActive } : c)));
    } catch {
      toast.error("Failed to update coupon");
    }
  };

  const openEditDialog = (coupon: CouponCode) => {
    setEditingCoupon(coupon);
    setCouponForm({
      code: coupon.code,
      description: coupon.description || "",
      discount_type: coupon.discount_type,
      discount_value: coupon.discount_value,
      min_order_amount: coupon.min_order_amount || 0,
      max_uses: coupon.max_uses,
      valid_until: coupon.valid_until ? format(new Date(coupon.valid_until), "yyyy-MM-dd") : "",
    });
    setCouponDialogOpen(true);
  };

  const openNewCouponDialog = () => {
    setEditingCoupon(null);
    setCouponForm({
      code: "",
      description: "",
      discount_type: "percentage",
      discount_value: 10,
      min_order_amount: 0,
      max_uses: null,
      valid_until: "",
    });
    setCouponDialogOpen(true);
  };

  const copyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } else {
      toast.error("Clipboard not available");
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const subtab = searchParams.get("subtab") || "deposits";
  const setSubtab = (val: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("subtab", val);
    setSearchParams(next, { replace: true });
  };

  // Scroll the Payment & Financial Controls card into view whenever a deep
  // link arrives with ?subtab=... (e.g. the "Coupons" item in the side nav).
  // Without this the user lands on the Settings → Payments tab but the Coupons
  // sub-section sits far below the fold and feels like the link did nothing.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!loading && searchParams.get("subtab") && rootRef.current) {
      rootRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [loading, searchParams]);


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={rootRef}>
      <Tabs value={subtab} onValueChange={setSubtab} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full max-w-3xl">
          <TabsTrigger value="deposits" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Deposits</span>
          </TabsTrigger>
          <TabsTrigger value="tax" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Tax</span>
          </TabsTrigger>
          <TabsTrigger value="shop-fee" className="gap-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">Shop Fee</span>
          </TabsTrigger>
          <TabsTrigger value="waste-oil" className="gap-2">
            <Droplets className="h-4 w-4" />
            <span className="hidden sm:inline">Waste Oil</span>
          </TabsTrigger>
          <TabsTrigger value="surcharge" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Surcharge</span>
          </TabsTrigger>
          <TabsTrigger value="oil" className="gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Oil Pricing</span>
          </TabsTrigger>
          <TabsTrigger value="coupons" className="gap-2">
            <Tag className="h-4 w-4" />
            <span className="hidden sm:inline">Coupons</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="deposits">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Deposit Requirements
              </CardTitle>
              <CardDescription>
                Require customers to pay a deposit when booking appointments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Accept Deposits</Label>
                  <p className="text-sm text-muted-foreground">
                    Charge customers upfront when they book
                  </p>
                </div>
                <Switch
                  checked={settings.accept_deposits}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, accept_deposits: checked })
                  }
                />
              </div>

              {settings.accept_deposits && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Deposit Percentage</Label>
                      <span className="text-2xl font-bold">{settings.deposit_percentage}%</span>
                    </div>
                    <Slider
                      value={[settings.deposit_percentage]}
                      onValueChange={([value]) =>
                        setSettings({ ...settings, deposit_percentage: value })
                      }
                      min={5}
                      max={100}
                      step={5}
                      className="py-4"
                    />
                    <p className="text-sm text-muted-foreground">
                      Customers will pay {settings.deposit_percentage}% of the service price when booking
                    </p>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Deposit Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Tax Configuration
              </CardTitle>
              <CardDescription>
                Set your local tax rate to be applied at checkout
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Tax Rate</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={settings.tax_rate}
                      onChange={(e) =>
                        setSettings({ ...settings, tax_rate: Number(e.target.value) || 0 })
                      }
                      className="w-24 text-right"
                      min={0}
                      max={100}
                      step={0.25}
                    />
                    <Percent className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  This tax rate will be automatically added to invoices and receipts
                </p>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Tax Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shop-fee">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Shop Supplies Fee
              </CardTitle>
              <CardDescription>
                Charge a fee for shop supplies and materials used during all services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Shop Fee</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply to all service invoices
                  </p>
                </div>
                <Switch
                  checked={settings.shop_fee_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, shop_fee_enabled: checked })
                  }
                />
              </div>

              {settings.shop_fee_enabled && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Fee Type</Label>
                      <Select
                        value={settings.shop_fee_type}
                        onValueChange={(value: "percentage" | "fixed") =>
                          setSettings({ ...settings, shop_fee_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage of Service Total (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Shop Fee {settings.shop_fee_type === "percentage" ? "Percentage" : "Amount"}
                      </Label>
                      <div className="flex items-center gap-2">
                        {settings.shop_fee_type === "fixed" && (
                          <span className="text-muted-foreground">$</span>
                        )}
                        <Input
                          type="number"
                          value={settings.shop_fee_value}
                          onChange={(e) =>
                            setSettings({ 
                              ...settings, 
                              shop_fee_value: bankersRound(Number(e.target.value) || 0, 2)
                            })
                          }
                          className="w-32"
                          min={0}
                          max={settings.shop_fee_type === "percentage" ? 20 : 100}
                          step={settings.shop_fee_type === "percentage" ? 0.5 : 1}
                        />
                        {settings.shop_fee_type === "percentage" && (
                          <Percent className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Fee Description</Label>
                      <Input
                        value={settings.shop_fee_description}
                        onChange={(e) =>
                          setSettings({ ...settings, shop_fee_description: e.target.value })
                        }
                        placeholder="Shop Supplies Fee"
                        maxLength={50}
                      />
                      <p className="text-xs text-muted-foreground">
                        Displayed on invoices and receipts
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Example on $100 Service</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <span>Service Total:</span>
                      <span className="text-right">$100.00</span>
                      <span>{settings.shop_fee_description}:</span>
                      <span className="text-right">
                        +${settings.shop_fee_type === "percentage" 
                          ? formatMoney(100 * settings.shop_fee_value / 100)
                          : formatMoney(settings.shop_fee_value)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Shop Fee Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="waste-oil">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="h-5 w-5" />
                Waste Oil Disposal Fee
              </CardTitle>
              <CardDescription>
                Charge a fee for proper disposal of used oil from oil change services
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Waste Oil Fee</Label>
                  <p className="text-sm text-muted-foreground">
                    Applied only to oil change services
                  </p>
                </div>
                <Switch
                  checked={settings.waste_oil_fee_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, waste_oil_fee_enabled: checked })
                  }
                />
              </div>

              {settings.waste_oil_fee_enabled && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Waste Oil Fee Amount</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={settings.waste_oil_fee}
                          onChange={(e) =>
                            setSettings({ 
                              ...settings, 
                              waste_oil_fee: bankersRound(Number(e.target.value) || 0, 2)
                            })
                          }
                          className="w-32"
                          min={0}
                          max={50}
                          step={0.5}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Fixed fee charged per oil change service
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">How It Works</p>
                    <p className="text-sm text-muted-foreground">
                      This fee covers the cost of environmentally responsible disposal of used motor oil. 
                      It will be automatically added as a line item on oil change service invoices.
                    </p>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Waste Oil Fee Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oil">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Oil Change Pricing
              </CardTitle>
              <CardDescription>
                Configure automatic pricing adjustments for oil change services based on vehicle specifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Price Per Extra Quart</Label>
                    <p className="text-sm text-muted-foreground">
                      Base price assumes 5 quarts. This amount is added for each extra quart.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={settings.oil_price_per_quart}
                      onChange={(e) =>
                        setSettings({ ...settings, oil_price_per_quart: bankersRound(Number(e.target.value) || 0, 2) })
                      }
                      className="w-24 text-right"
                      min={0}
                      max={50}
                      step={0.5}
                    />
                  </div>
                </div>
                
                <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                  <p className="text-sm font-medium">Example Pricing</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                    <span>5 quarts (base):</span>
                    <span className="text-right">$0 extra</span>
                    <span>6 quarts:</span>
                    <span className="text-right">1 extra qt × ${formatMoney(settings.oil_price_per_quart)} = +${formatMoney(settings.oil_price_per_quart)}</span>
                    <span>8 quarts:</span>
                    <span className="text-right">3 extra qts × ${formatMoney(settings.oil_price_per_quart)} = +${formatMoney(settings.oil_price_per_quart * 3)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    Any fractional capacity (e.g., 5.5 qts) rounds up to the next whole quart.
                  </p>
                </div>
              </div>

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Oil Pricing
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="surcharge">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Payment Surcharging
              </CardTitle>
              <CardDescription>
                Pass credit card processing fees to customers who pay online
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label>Enable Surcharging</Label>
                  <p className="text-sm text-muted-foreground">
                    Add a convenience fee for card payments
                  </p>
                </div>
                <Switch
                  checked={settings.surcharge_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, surcharge_enabled: checked })
                  }
                />
              </div>

              {settings.surcharge_enabled && (
                <>
                  <Separator />
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Surcharge Type</Label>
                      <Select
                        value={settings.surcharge_type}
                        onValueChange={(value: "percentage" | "fixed") =>
                          setSettings({ ...settings, surcharge_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>
                        Surcharge {settings.surcharge_type === "percentage" ? "Percentage" : "Amount"}
                      </Label>
                      <div className="flex items-center gap-2">
                        {settings.surcharge_type === "fixed" && (
                          <span className="text-muted-foreground">$</span>
                        )}
                        <Input
                          type="number"
                          value={settings.surcharge_value}
                          onChange={(e) =>
                            setSettings({ 
                              ...settings, 
                              surcharge_value: bankersRound(Number(e.target.value) || 0, 2)
                            })
                          }
                          className="w-32"
                          min={0}
                          max={settings.surcharge_type === "percentage" ? 10 : 50}
                          step={settings.surcharge_type === "percentage" ? 0.1 : 0.5}
                        />
                        {settings.surcharge_type === "percentage" && (
                          <Percent className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Fee Description</Label>
                      <Input
                        value={settings.surcharge_description}
                        onChange={(e) =>
                          setSettings({ ...settings, surcharge_description: e.target.value })
                        }
                        placeholder="Card Processing Fee"
                        maxLength={50}
                      />
                      <p className="text-xs text-muted-foreground">
                        Shown to customers at checkout
                      </p>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                          Legal Compliance Notice
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Surcharging regulations vary by state and card network. Some states prohibit 
                          surcharges. Surcharges cannot exceed 4% or your cost of acceptance. Consult 
                          your payment processor and legal counsel for compliance requirements.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <p className="text-sm font-medium">Example on $100 Service</p>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <span>Service Total:</span>
                      <span className="text-right">$100.00</span>
                      <span>{settings.surcharge_description}:</span>
                      <span className="text-right">
                        +${settings.surcharge_type === "percentage" 
                          ? formatMoney(100 * settings.surcharge_value / 100)
                          : formatMoney(settings.surcharge_value)}
                      </span>
                      <span className="font-medium text-foreground">Customer Pays:</span>
                      <span className="text-right font-medium text-foreground">
                        ${settings.surcharge_type === "percentage" 
                          ? formatMoney(100 + (100 * settings.surcharge_value / 100))
                          : formatMoney(100 + settings.surcharge_value)}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Surcharge Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coupons" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Phone Number as Coupon
              </CardTitle>
              <CardDescription>
                When enabled, any existing customer can enter their phone number (with or without dashes) as a coupon code to get the discount you configure below.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable phone-as-coupon</Label>
                  <p className="text-sm text-muted-foreground">
                    Customers in your database automatically qualify.
                  </p>
                </div>
                <Switch
                  checked={settings.phone_as_coupon_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, phone_as_coupon_enabled: checked })
                  }
                />
              </div>

              {settings.phone_as_coupon_enabled && (
                <div className="space-y-4 border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Discount Type</Label>
                      <Select
                        value={settings.phone_coupon_discount_type}
                        onValueChange={(value: "percentage" | "fixed") =>
                          setSettings({ ...settings, phone_coupon_discount_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed Amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>
                        {settings.phone_coupon_discount_type === "percentage"
                          ? "Discount (%)"
                          : "Discount Amount"}
                      </Label>
                      <Input
                        type="number"
                        value={settings.phone_coupon_discount_value}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            phone_coupon_discount_value: bankersRound(Number(e.target.value) || 0, 2),
                          })
                        }
                        min={0}
                        max={settings.phone_coupon_discount_type === "percentage" ? 100 : undefined}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Min Order Amount</Label>
                      <Input
                        type="number"
                        value={settings.phone_coupon_min_order_amount}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            phone_coupon_min_order_amount: bankersRound(Number(e.target.value) || 0, 2),
                          })
                        }
                        min={0}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Label / Description</Label>
                      <Input
                        value={settings.phone_coupon_description}
                        onChange={(e) =>
                          setSettings({ ...settings, phone_coupon_description: e.target.value })
                        }
                        placeholder="Loyalty discount"
                      />
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleSaveSettings} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Phone Coupon Settings
              </Button>
            </CardContent>
          </Card>

          <PhoneCouponsAdmin enabled={settings.phone_as_coupon_enabled} />




          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Coupon Codes
                  </CardTitle>
                  <CardDescription>
                    Create and manage discount codes for your customers
                  </CardDescription>
                </div>
                <Dialog open={couponDialogOpen} onOpenChange={setCouponDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={openNewCouponDialog} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Coupon
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        {editingCoupon ? "Edit Coupon" : "Create New Coupon"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="space-y-2">
                        <Label>Coupon Code</Label>
                        <Input
                          value={couponForm.code}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })
                          }
                          placeholder="SUMMER20"
                          className="font-mono"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Description (Optional)</Label>
                        <Input
                          value={couponForm.description}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, description: e.target.value })
                          }
                          placeholder="Summer sale discount"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Discount Type</Label>
                          <Select
                            value={couponForm.discount_type}
                            onValueChange={(value) =>
                              setCouponForm({ ...couponForm, discount_type: value })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="percentage">Percentage</SelectItem>
                              <SelectItem value="fixed">Fixed Amount</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>
                            {couponForm.discount_type === "percentage"
                              ? "Discount (%)"
                              : "Discount Amount"}
                          </Label>
                          <Input
                            type="number"
                            value={couponForm.discount_value}
                            onChange={(e) =>
                              setCouponForm({
                                ...couponForm,
                                discount_value: bankersRound(Number(e.target.value) || 0, 2),
                              })
                            }
                            min={0}
                            max={couponForm.discount_type === "percentage" ? 100 : undefined}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Min Order Amount</Label>
                          <Input
                            type="number"
                            value={couponForm.min_order_amount}
                            onChange={(e) =>
                              setCouponForm({
                                ...couponForm,
                                min_order_amount: bankersRound(Number(e.target.value) || 0, 2),
                              })
                            }
                            min={0}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Max Uses (Optional)</Label>
                          <Input
                            type="number"
                            value={couponForm.max_uses || ""}
                            onChange={(e) =>
                              setCouponForm({
                                ...couponForm,
                                max_uses: e.target.value ? parseInt(e.target.value) : null,
                              })
                            }
                            placeholder="Unlimited"
                            min={1}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Valid Until (Optional)</Label>
                        <Input
                          type="date"
                          value={couponForm.valid_until}
                          onChange={(e) =>
                            setCouponForm({ ...couponForm, valid_until: e.target.value })
                          }
                        />
                      </div>

                      <Button
                        onClick={handleSaveCoupon}
                        disabled={savingCoupon}
                        className="w-full"
                      >
                        {savingCoupon ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        {editingCoupon ? "Update Coupon" : "Create Coupon"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {coupons.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No coupons yet</h3>
                  <p className="text-muted-foreground mb-4">
                    Create discount codes to attract more customers
                  </p>
                  <Button onClick={openNewCouponDialog} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Coupon
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Usage</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coupons.map((coupon) => (
                        <TableRow key={coupon.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="font-mono bg-muted px-2 py-1 rounded text-sm">
                                {coupon.code}
                              </code>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => copyCode(coupon.code)}
                              >
                                {copiedCode === coupon.code ? (
                                  <CheckCircle2 className="h-3 w-3 text-gray-500" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            {coupon.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {coupon.description}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">
                              {coupon.discount_type === "percentage"
                                ? `${coupon.discount_value}%`
                                : `$${coupon.discount_value}`}
                            </span>
                            {coupon.min_order_amount > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Min: ${coupon.min_order_amount}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <span>
                              {coupon.used_count}
                              {coupon.max_uses ? ` / ${coupon.max_uses}` : ""}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={coupon.is_active}
                                onCheckedChange={(checked) =>
                                  handleToggleCoupon(coupon.id, checked)
                                }
                              />
                              <Badge
                                variant={coupon.is_active ? "default" : "secondary"}
                              >
                                {coupon.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(coupon)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteCoupon(coupon.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
