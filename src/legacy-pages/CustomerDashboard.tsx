import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { fetchCustomerAccount, onAuthStateChange, customerSignOut } from "@/application/queries/customer-dashboard.query";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, LogOut, Calendar, DollarSign, FileText, Gift, GraduationCap, Sparkles, User } from "lucide-react";
import { CustomerAppointmentsTab } from "@/components/customer/CustomerAppointmentsTab";
import { CustomerPaymentsTab } from "@/components/customer/CustomerPaymentsTab";
import { CustomerServiceHistoryTab } from "@/components/customer/CustomerServiceHistoryTab";
import { CustomerAccountTab } from "@/components/customer/CustomerAccountTab";
import { CustomerRewardsTab } from "@/components/customer/CustomerRewardsTab";
import { CustomerTrainingTab } from "@/components/customer/CustomerTrainingTab";

export interface CustomerAccount {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  user_id: string;
  provider_id: string | null;
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchAccount = useCallback(async () => {
    const data = await fetchCustomerAccount();
    if (!data) {
      navigate("/customer/auth");
      return;
    }
    setAccount(data);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/customer/auth");
      }
    });
    fetchAccount();
    return unsubscribe;
  }, [fetchAccount, navigate]);

  const handleLogout = async () => {
    await customerSignOut();
    toast.success("Logged out successfully");
    navigate("/customer/auth");
  };

  const handleAccountUpdate = (updated: CustomerAccount) => {
    setAccount(updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary">
                {account?.full_name?.charAt(0) ||
                  account?.email?.charAt(0) ||
                  "U"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">
                {account?.full_name || "Customer"}
              </p>
              <p className="text-sm text-muted-foreground">{account?.email}</p>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Dashboard Content */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8 rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" /> Your service home
              </p>
              <h1 className="text-3xl font-bold mb-2">Customer Dashboard</h1>
              <p className="max-w-2xl text-muted-foreground">
                Book and manage appointments, review service history, track payments, and use rewards or coupon offers in one place.
              </p>
            </div>
            <Button onClick={() => setActiveTab("rewards")} className="gap-2">
              <Gift className="h-4 w-4" /> View rewards
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8 w-full justify-start flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Home
            </TabsTrigger>
            <TabsTrigger value="appointments" className="gap-2">
              <Calendar className="h-4 w-4" />
              Appointments
            </TabsTrigger>
            <TabsTrigger value="payments" className="gap-2">
              <DollarSign className="h-4 w-4" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="service-history" className="gap-2">
              <FileText className="h-4 w-4" />
              Service History
            </TabsTrigger>
            <TabsTrigger value="rewards" className="gap-2">
              <Gift className="h-4 w-4" />
              Rewards & Offers
            </TabsTrigger>
            <TabsTrigger value="training" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              Training
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setActiveTab("appointments")}>
                <CardContent className="p-5">
                  <Calendar className="mb-3 h-5 w-5 text-primary" />
                  <p className="font-semibold">Manage appointments</p>
                  <p className="mt-1 text-sm text-muted-foreground">See upcoming visits, reschedule, or cancel when available.</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setActiveTab("service-history")}>
                <CardContent className="p-5">
                  <FileText className="mb-3 h-5 w-5 text-primary" />
                  <p className="font-semibold">Review service history</p>
                  <p className="mt-1 text-sm text-muted-foreground">Keep a clean record of completed and in-progress work.</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setActiveTab("rewards")}>
                <CardContent className="p-5">
                  <Gift className="mb-3 h-5 w-5 text-primary" />
                  <p className="font-semibold">Rewards & coupon offers</p>
                  <p className="mt-1 text-sm text-muted-foreground">Track loyalty progress and copy available coupon codes.</p>
                </CardContent>
              </Card>
              <Card className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => setActiveTab("training")}>
                <CardContent className="p-5">
                  <GraduationCap className="mb-3 h-5 w-5 text-primary" />
                  <p className="font-semibold">Earn training credits</p>
                  <p className="mt-1 text-sm text-muted-foreground">Complete short modules to learn the portal and unlock service-credit rewards.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appointments">
            {account && <CustomerAppointmentsTab account={account} />}
          </TabsContent>

          <TabsContent value="payments">
            {account && <CustomerPaymentsTab account={account} />}
          </TabsContent>

          <TabsContent value="service-history">
            {account && <CustomerServiceHistoryTab account={account} />}
          </TabsContent>

          <TabsContent value="rewards">
            {account && <CustomerRewardsTab account={account} />}
          </TabsContent>

          <TabsContent value="training">
            <CustomerTrainingTab />
          </TabsContent>

          <TabsContent value="account">
            {account && (
              <CustomerAccountTab
                account={account}
                onUpdate={handleAccountUpdate}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
