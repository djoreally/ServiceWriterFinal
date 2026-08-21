import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { verifyAdminAccess, adminSignOut } from "@/application/queries/admin-dashboard.query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  Users, 
  Car, 
  Settings, 
  BarChart3, 
  LogOut,
  Loader2,
  Activity,
  FileText,
  Database,
  Mail,
  Contact,
  ScrollText,
  Megaphone,
  Wallet,
  MessageSquare,
  GraduationCap,
  Building2,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
const AdminCarfaxSettings = lazy(() => import("@/components/admin/AdminCarfaxSettings").then((module) => ({ default: module.AdminCarfaxSettings })));
const AdminPlatformStats = lazy(() => import("@/components/admin/AdminPlatformStats").then((module) => ({ default: module.AdminPlatformStats })));
const AdminUserManagement = lazy(() => import("@/components/admin/AdminUserManagement").then((module) => ({ default: module.AdminUserManagement })));
const AdminSystemHealth = lazy(() => import("@/components/admin/AdminSystemHealth").then((module) => ({ default: module.AdminSystemHealth })));
const AdminAuditLogs = lazy(() => import("@/components/admin/AdminAuditLogs").then((module) => ({ default: module.AdminAuditLogs })));
const AdminDatabaseExplorer = lazy(() => import("@/components/admin/AdminDatabaseExplorer").then((module) => ({ default: module.AdminDatabaseExplorer })));
const WebhookHealthDashboard = lazy(() => import("@/components/admin/WebhookHealthDashboard").then((module) => ({ default: module.WebhookHealthDashboard })));
const AdminPlatformPlans = lazy(() => import("@/components/admin/AdminPlatformPlans").then((module) => ({ default: module.AdminPlatformPlans })));
const AdminContactManagementShowcase = lazy(() => import("@/components/admin/AdminContactManagementShowcase").then((module) => ({ default: module.AdminContactManagementShowcase })));
const AdminEmailCampaignShowcase = lazy(() => import("@/components/admin/AdminEmailCampaignShowcase").then((module) => ({ default: module.AdminEmailCampaignShowcase })));
const AdminOutreachTemplatesShowcase = lazy(() => import("@/components/admin/AdminOutreachTemplatesShowcase").then((module) => ({ default: module.AdminOutreachTemplatesShowcase })));
const AdminGtmStrategyShowcase = lazy(() => import("@/components/admin/AdminGtmStrategyShowcase").then((module) => ({ default: module.AdminGtmStrategyShowcase })));
const AdminStripePaymentMethods = lazy(() => import("@/components/admin/AdminStripePaymentMethods").then((module) => ({ default: module.AdminStripePaymentMethods })));
const AdminMessagingHealth = lazy(() => import("@/components/admin/AdminMessagingHealth").then((module) => ({ default: module.AdminMessagingHealth })));
const AdminTrainingRewards = lazy(() => import("@/components/admin/AdminTrainingRewards").then((module) => ({ default: module.AdminTrainingRewards })));
const AdminOrganization360 = lazy(() => import("@/components/admin/AdminOrganization360").then((module) => ({ default: module.AdminOrganization360 })));
const McpConnectPanel = lazy(() => import("@/components/integrations/McpConnectPanel").then((module) => ({ default: module.McpConnectPanel })));
const InternalInbox = lazy(() => import("@/components/communications/InternalInbox").then((module) => ({ default: module.InternalInbox })));

const AdminSectionLoader = () => (
  <div className="flex min-h-64 items-center justify-center rounded-xl border bg-card">
    <Loader2 className="h-6 w-6 animate-spin text-primary" />
  </div>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");

  const checkAdminAccess = useCallback(async () => {
    const result = await verifyAdminAccess();
    
    if (!result.isAdmin) {
      if (!result.email) {
        navigate("/admin/login");
      } else {
        toast.error("Access denied");
        await adminSignOut();
        navigate("/admin/login");
      }
      return;
    }

    setIsAdmin(true);
    setAdminEmail(result.email);
    setLoading(false);
  }, [navigate]);

  useEffect(() => {
    checkAdminAccess();
  }, [checkAdminAccess]);

  const handleLogout = async () => {
    await adminSignOut();
    navigate("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Header */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Admin Dashboard</h1>
              <p className="text-xs text-muted-foreground">Platform Administration</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline" className="hidden gap-1 sm:flex">
              <Shield className="h-3 w-3" />
              {adminEmail}
            </Badge>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <Tabs defaultValue="overview" className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <TabsList className="flex h-auto max-w-full justify-start gap-1 overflow-x-auto bg-muted/50 p-1 lg:sticky lg:top-24 lg:flex-col lg:overflow-visible lg:rounded-xl lg:p-2 [&_[role=tab]]:shrink-0 [&_[role=tab]]:justify-start">
            <TabsTrigger value="overview" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="health" className="gap-2">
              <Activity className="h-4 w-4" />
              Health
            </TabsTrigger>
            <TabsTrigger value="organization-360" className="gap-2">
              <Building2 className="h-4 w-4" />
              Org 360
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <FileText className="h-4 w-4" />
              Audit Logs
            </TabsTrigger>
            <TabsTrigger value="database" className="gap-2">
              <Database className="h-4 w-4" />
              Database
            </TabsTrigger>
            <TabsTrigger value="carfax" className="gap-2">
              <Car className="h-4 w-4" />
              CARFAX
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="plans" className="gap-2">
              <Database className="h-4 w-4" />
              Plans
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2">
              <Contact className="h-4 w-4" />
              Contact Mgmt
            </TabsTrigger>
            <TabsTrigger value="email-campaigns" className="gap-2">
              <Mail className="h-4 w-4" />
              Email Campaigns
            </TabsTrigger>
            <TabsTrigger value="outreach-templates" className="gap-2">
              <ScrollText className="h-4 w-4" />
              Outreach Templates
            </TabsTrigger>
            <TabsTrigger value="gtm-strategy" className="gap-2">
              <Megaphone className="h-4 w-4" />
              GTM Strategy
            </TabsTrigger>
            <TabsTrigger value="payment-methods" className="gap-2">
              <Wallet className="h-4 w-4" />
              Payment Methods
            </TabsTrigger>
            <TabsTrigger value="messaging" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              Messaging
            </TabsTrigger>
            <TabsTrigger value="agent-integrations" className="gap-2">
              <Bot className="h-4 w-4" />
              Agent Integrations
            </TabsTrigger>
            <TabsTrigger value="training-rewards" className="gap-2">
              <GraduationCap className="h-4 w-4" />
              Training Rewards
            </TabsTrigger>
          </TabsList>

          <Suspense fallback={<AdminSectionLoader />}>
            <TabsContent value="overview" className="mt-0 min-w-0 space-y-6">
              <AdminPlatformStats />
            </TabsContent>

          <TabsContent value="health" className="mt-0 min-w-0 space-y-6">
            <AdminSystemHealth />
            <WebhookHealthDashboard />
          </TabsContent>

          <TabsContent value="organization-360" className="mt-0 min-w-0 space-y-6">
            <AdminOrganization360 />
          </TabsContent>

          <TabsContent value="users" className="mt-0 min-w-0 space-y-6">
            <AdminUserManagement />
          </TabsContent>

          <TabsContent value="audit" className="mt-0 min-w-0 space-y-6">
            <AdminAuditLogs />
          </TabsContent>

          <TabsContent value="database" className="mt-0 min-w-0 space-y-6">
            <AdminDatabaseExplorer />
          </TabsContent>

          <TabsContent value="carfax" className="mt-0 min-w-0 space-y-6">
            <AdminCarfaxSettings />
          </TabsContent>

          <TabsContent value="settings" className="mt-0 min-w-0 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Platform Settings</CardTitle>
                <CardDescription>
                  Global configuration options for the platform
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Additional platform settings will be available here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="plans" className="mt-0 min-w-0 space-y-6">
            <AdminPlatformPlans />
          </TabsContent>

          <TabsContent value="contacts" className="mt-0 min-w-0 space-y-6">
            <AdminContactManagementShowcase />
          </TabsContent>

          <TabsContent value="email-campaigns" className="mt-0 min-w-0 space-y-6">
            <AdminEmailCampaignShowcase />
          </TabsContent>

          <TabsContent value="outreach-templates" className="mt-0 min-w-0 space-y-6">
            <AdminOutreachTemplatesShowcase />
          </TabsContent>

          <TabsContent value="gtm-strategy" className="mt-0 min-w-0 space-y-6">
            <AdminGtmStrategyShowcase />
          </TabsContent>

          <TabsContent value="payment-methods" className="mt-0 min-w-0 space-y-6">
            <AdminStripePaymentMethods />
          </TabsContent>

          <TabsContent value="messaging" className="mt-0 min-w-0 space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Internal messaging</h2>
              <p className="text-sm text-muted-foreground">Messages shared between administrators, dispatchers, and technicians.</p>
            </div>
            <InternalInbox />
            <AdminMessagingHealth />
          </TabsContent>

          <TabsContent value="agent-integrations" className="mt-0 min-w-0 space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Agent integrations (MCP)</h2>
              <p className="text-sm text-muted-foreground">
                The connection providers use to link ChatGPT, Claude, or Cursor to their ServiceWriter workspace.
              </p>
            </div>
            <McpConnectPanel variant="admin" />
          </TabsContent>

          <TabsContent value="training-rewards" className="mt-0 min-w-0 space-y-6">
            <AdminTrainingRewards />
          </TabsContent>
          </Suspense>

        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
