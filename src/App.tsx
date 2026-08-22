
import { Suspense, lazy, ComponentType, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { RegionalSettingsProvider } from "@/contexts/RegionalSettingsContext";
import { FeatureProvider } from "@/shared/features/feature.provider";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { SubscriptionProvider, useFeatureGate, type PlanFeatures } from "@/contexts/SubscriptionContext";
import { useAuth } from "@packages/auth";
// AIAssistant is lazy-loaded — it is a heavy, always-mounted component that only
// activates when opened. Deferring it removes it from the critical-path bundle.
const AIAssistant = lazyRetry(() =>
  import("./components/ai/AIAssistant").then((m) => ({ default: m.AIAssistant }))
);
import { useServiceWorkerUpdate } from "./hooks/useServiceWorkerUpdate";
import { RequireRole } from "./components/security/RequireRole";
import { RouteRoleGuard } from "./components/security/RouteRoleGuard";
import { AccessDenied } from "./components/security/AccessDenied";
import { canAccessRoute } from "@/domain/auth/access-policy";
import { useTeamRole } from "@/hooks/useTeamRole";

import RouteErrorBoundary from "./shared/errors/RouteErrorBoundary";
import { useOfflinePhase1Bootstrap } from "./offline/useOfflinePhase1Bootstrap";
import { useOfflineOutboxWorker } from "./offline/useOfflineOutboxWorker";
import { setCurrentOfflineTenantSlug } from "./offline/rollout";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { OfflineStatusBanner } from "@/components/offline/OfflineStatusBanner";
import { PostHogIdentity } from "@/components/analytics/PostHogIdentity";
import { useStartupNavigation } from "@/hooks/useStartupNavigation";
import {
  isStaleChunkError,
  markChunkRecoverySuccess,
  recoverFromStaleChunk,
} from "@/lib/chunkRecovery";

/**
 * Retry wrapper for dynamic imports.
 * On flaky networks the initial fetch can fail — retry with backoff.
 * When the module URL is missing entirely (deploy shipped a new bundle and the
 * client still holds a stale index.html referencing old chunk hashes), delegate
 * to the shared chunk-recovery helper: purge SW + caches, then hard reload with
 * a cache-busting param (bounded attempt counter prevents reload loops).
 */
// Component props are inferred from each factory's concrete component type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  retries = 2,
): React.LazyExoticComponent<T> {
  return lazy(() => {
    const attempt = (remaining: number): Promise<{ default: T }> =>
      factory().catch((err) => {
        if (remaining <= 0) {
          if (isStaleChunkError(err) && recoverFromStaleChunk()) {
            // Never-resolving: keep Suspense fallback visible while the
            // browser navigates to the fresh HTML.
            return new Promise<{ default: T }>(() => {});
          }
          throw err;
        }
        const retryDelay = typeof process !== "undefined" && process.env.NODE_ENV === "test" ? 0 : 800;
        return new Promise<{ default: T }>((resolve) =>
          setTimeout(() => resolve(attempt(remaining - 1)), retryDelay),
        );
      });
    return attempt(retries);
  });
}

// Catch stale-chunk errors outside React.lazy (route prefetch, event-driven
// imports) and trigger the same one-shot reload.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (e) => {
    if (recoverFromStaleChunk()) e.preventDefault();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (isStaleChunkError((e as PromiseRejectionEvent).reason) && recoverFromStaleChunk()) {
      e.preventDefault();
    }
  });
  // App code executed — the bundle is healthy, reset the recovery budget.
  markChunkRecoverySuccess();
}

const Homepage = lazyRetry(() => import("./pages/Homepage"));
const FindProvider = lazyRetry(() => import("./pages/FindProvider"));
const ProviderProfile = lazyRetry(() => import("./pages/ProviderProfile"));
const WorkforceAuth = lazyRetry(() => import("./pages/WorkforceAuth").then((module) => ({ default: module.WorkforceAuth })));
const LoginHub = lazyRetry(() => import("./pages/LoginHub"));
const OAuthConsent = lazyRetry(() => import("./pages/OAuthConsent"));
const Unsubscribe = lazyRetry(() => import("./pages/Unsubscribe"));
const Pricing = lazyRetry(() => import("./pages/Pricing"));
const Plans = lazyRetry(() => import("./pages/Plans"));
const About = lazyRetry(() => import("./pages/About"));
const Blog = lazyRetry(() => import("./pages/Blog"));
const HowItWorks = lazyRetry(() => import("./pages/HowItWorks"));
const Faqs = lazyRetry(() => import("./pages/Faqs"));
const Careers = lazyRetry(() => import("./pages/Careers"));
const AllFeaturesShowcaseArticle = lazyRetry(() => import("./pages/blog/AllFeaturesShowcaseArticle"));
const PrivacyPolicyPage = lazyRetry(() => import("./pages/legal/PrivacyPolicyPage"));
const TermsOfServicePage = lazyRetry(() => import("./pages/legal/TermsOfServicePage"));
const SecurityPage = lazyRetry(() => import("./pages/legal/SecurityPage"));
const PartnerProgram = lazyRetry(() => import("./pages/PartnerProgram"));
const AdvertisingNetwork = lazyRetry(() => import("./pages/AdvertisingNetwork"));
const ContactUs = lazyRetry(() => import("./pages/ContactUs"));
const FairPriceCalculator = lazyRetry(() => import("./pages/FairPriceCalculator"));
const WhiteGloveOnboarding = lazyRetry(() => import("./pages/WhiteGloveOnboarding"));
const InsightsFeed = lazyRetry(() => import("./pages/InsightsFeed"));
const TechnicalArticle = lazyRetry(() => import("./pages/TechnicalArticle"));
const Onboarding = lazyRetry(() => import("./pages/Onboarding"));
const Dashboard = lazyRetry(() => import("./pages/Dashboard"));
const Customers = lazyRetry(() => import("./pages/Customers"));
const CustomerDetail = lazyRetry(() => import("./pages/CustomerDetail"));
const Vehicles = lazyRetry(() => import("./pages/Vehicles"));
const VehicleDetail = lazyRetry(() => import("./pages/VehicleDetail"));
const Services = lazyRetry(() => import("./pages/Services"));
const ServiceDetail = lazyRetry(() => import("./pages/ServiceDetail"));
const ServiceCatalog = lazyRetry(() => import("./pages/ServiceCatalog"));
const ServicePackages = lazyRetry(() => import("./pages/ServicePackages"));
const Subscriptions = lazyRetry(() => import("./pages/Subscriptions"));
const QuickService = lazyRetry(() => import("./pages/QuickService"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const AgentIntegrations = lazyRetry(() => import("./pages/AgentIntegrations"));
const Inventory = lazyRetry(() => import("./pages/Inventory"));
const Quotes = lazyRetry(() => import("./pages/Quotes"));
const Appointments = lazyRetry(() => import("./pages/Appointments"));
const AppointmentDetail = lazyRetry(() => import("./pages/AppointmentDetail"));
const PublicBooking = lazyRetry(() => import("./pages/PublicBooking"));
const TenantBooking = lazyRetry(() => import("./pages/TenantBooking"));
const Availability = lazyRetry(() => import("./pages/Availability"));
const MarketplaceHub = lazyRetry(() => import("./pages/MarketplaceHub"));
const JobPricingTool = lazyRetry(() => import("./pages/JobPricingTool"));
const TirePricing = lazyRetry(() => import("./pages/TirePricing"));
const DetailingPricing = lazyRetry(() => import("./pages/DetailingPricing"));
const Payments = lazyRetry(() => import("./pages/Payments"));

const Marketing = lazyRetry(() => import("./pages/Marketing"));
const MarketingVideos = lazyRetry(() => import("./pages/MarketingVideos"));
const Newsletter = lazyRetry(() => import("./pages/Newsletter"));
const FeaturesGuide = lazyRetry(() => import("./pages/FeaturesGuide"));
const FeatureDetail = lazyRetry(() => import("./pages/FeatureDetail"));
const VehicleSpecs = lazyRetry(() => import("./pages/VehicleSpecs"));
const TestimonialSubmit = lazyRetry(() => import("./pages/TestimonialSubmit"));
const PaymentSuccess = lazyRetry(() => import("./pages/PaymentSuccess"));
const CustomerMessagingPreferences = lazyRetry(() => import("./pages/CustomerMessagingPreferences"));
const AdminLogin = lazyRetry(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazyRetry(() => import("./pages/admin/AdminDashboard"));
const AdminPlans = lazyRetry(() => import("./pages/admin/AdminPlans"));
const CustomerAuth = lazyRetry(() => import("./pages/CustomerAuth"));
const CustomerDashboard = lazyRetry(() => import("./pages/CustomerDashboard"));
const FleetManagerPortal = lazyRetry(() => import("./pages/FleetManagerPortal"));
const SupportPage = lazyRetry(() => import("./pages/SupportPage"));
const KnowledgeBase = lazyRetry(() => import("./pages/KnowledgeBase"));
const KnowledgeBaseCategory = lazyRetry(() => import("./pages/KnowledgeBaseCategory"));
const Tutorials = lazyRetry(() => import("./pages/Tutorials"));
const WhatsNew = lazyRetry(() => import("./pages/WhatsNew"));
const NotFound = lazyRetry(() => import("./pages/NotFound"));
const BookingRedirect = lazyRetry(() => import("./pages/BookingRedirect"));
const PublicSubscriptions = lazyRetry(() => import("./pages/PublicSubscriptions"));
const PublicServices = lazyRetry(() => import("./pages/PublicServices"));
const Reports = lazyRetry(() => import("./pages/Reports"));
const Financials = lazyRetry(() => import("./pages/Financials"));
const Expenses = lazyRetry(() => import("./pages/Expenses"));
const Invoices = lazyRetry(() => import("./pages/Invoices"));
const Operations = lazyRetry(() => import("./pages/Operations"));
const TaxCompliance = lazyRetry(() => import("./pages/TaxCompliance"));
const TeamJoin = lazyRetry(() => import("./pages/TeamJoin"));
const InvitationCenter = lazyRetry(() => import("./pages/InvitationCenter"));
const InvitationAccept = lazyRetry(() => import("./pages/InvitationAccept"));
const LegacyInviteRedirect = lazyRetry(() => import("./pages/LegacyInviteRedirect"));
const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const GoogleCalendarCallback = lazyRetry(() => import("./pages/GoogleCalendarCallback"));
const MagicLinkLogin = lazyRetry(() => import("./pages/MagicLinkLogin"));
const SessionManagement = lazyRetry(() => import("./pages/SessionManagement"));
const Fleet = lazyRetry(() => import("./pages/Fleet"));
const VanDetail = lazyRetry(() => import("./pages/VanDetail"));
const TechnicianOS = lazyRetry(() => import("./pages/TechnicianOS"));
const DispatchEngine = lazyRetry(() => import("./pages/DispatchEngine"));
const WeatherGuard = lazyRetry(() => import("./pages/WeatherGuard"));
const CommandCenter = lazyRetry(() => import("./pages/CommandCenter"));
const Messages = lazyRetry(() => import("./pages/Messages"));
const Receptionist = lazyRetry(() => import("./pages/Receptionist"));
const RetentionEngine = lazyRetry(() => import("./pages/RetentionEngine"));
const RetentionVerify = lazyRetry(() => import("./pages/RetentionVerify"));
const VoiceAgentEmbed = lazyRetry(() => import("./pages/VoiceAgentEmbed"));
const FleetSchedulingPage = lazyRetry(() => import("./pages/fleet-os/FleetSchedulingPage"));

// Tech App (Field Technician Mobile App)
const TechAppLayout = lazyRetry(() => import("./pages/tech-app/TechAppLayout"));
const TechToday = lazyRetry(() => import("./pages/tech-app/TechToday"));
const TechJobs = lazyRetry(() => import("./pages/tech-app/TechJobs"));
const TechFleet = lazyRetry(() => import("./pages/tech-app/TechFleet"));
const TechJobDetail = lazyRetry(() => import("./pages/tech-app/TechJobDetail"));
const TechDataCenter = lazyRetry(() => import("./pages/tech-app/TechDataCenter"));
const TechRoute = lazyRetry(() => import("./pages/tech-app/TechRoute"));
const TechNavigation = lazyRetry(() => import("./pages/tech-app/TechNavigation"));
const TechMessages = lazyRetry(() => import("./pages/tech-app/TechMessages"));
const TechMore = lazyRetry(() => import("./pages/tech-app/TechMore"));
const TechInventory = lazyRetry(() => import("./pages/tech-app/TechInventory"));
const TechShift = lazyRetry(() => import("./pages/tech-app/TechShift"));
const TechShiftReview = lazyRetry(() => import("./pages/tech-app/TechShiftReview"));
const TechProfile = lazyRetry(() => import("./pages/tech-app/TechProfile"));
const TechSettings = lazyRetry(() => import("./pages/tech-app/TechSettings"));
const TechServices = lazyRetry(() => import("./pages/tech-app/TechServices"));
const Assets = lazyRetry(() => import("./pages/Assets"));
const FieldCompanion = lazyRetry(() => import("./pages/FieldCompanion"));


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ⚡ Performance: 5-minute stale time reduces refetches for stable data
      staleTime: 5 * 60 * 1000,
      // Cache data for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Don't refetch on window focus for better UX
      refetchOnWindowFocus: false,
      // Retry failed queries only once
      retry: 1,
    },
  },
});

const LoadingScreen = ({ message = "Loading..." }: { message?: string }) => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  </div>
);

/**
 * RequireAuth — auth/session render gate plus the single role-authorization
 * choke point for every protected route.
 *
 * Startup destination decisions live in `useStartupNavigation`, which is
 * mounted once at the app shell. This component never redirects on role: an
 * unauthorized deep link renders `AccessDenied` so there is no bounce/flash.
 */
const RequireAuth = ({ children }: { children: JSX.Element }) => {
  const { session, loading } = useAuth();
  const { role, loading: roleLoading } = useTeamRole();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (roleLoading) return <LoadingScreen />;

  // Unresolved identity is not a denial — RLS remains authoritative server-side.
  if (role && !canAccessRoute(role, location.pathname)) {
    return <AccessDenied />;
  }

  return children;
};



/**
 * RequirePlanFeature — gates premium features. Renders a soft skeleton while
 * the subscription resolves so the route subtree does NOT remount when the
 * answer arrives (preventing the layout-flash that used to bounce users).
 */
const RequirePlanFeature = ({
  feature,
  children,
}: {
  feature: keyof PlanFeatures;
  children: JSX.Element;
}) => {
  const { hasAccess, loading } = useFeatureGate(feature);

  if (loading) {
    return (
      <div className="min-h-screen bg-background animate-pulse" aria-busy="true" />
    );
  }

  if (!hasAccess) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <TerminologyProvider>
        <RegionalSettingsProvider>
          <FeatureProvider>
            <SubscriptionProvider>
              <TenantProvider>
                <BrowserRouter>
                  <KeyboardShortcutsProvider>
                    <PostHogIdentity />
                    <OfflineStatusBanner />
                    <Toaster />
                    <Sonner />
                    <AppRoutes />
                  </KeyboardShortcutsProvider>
                </BrowserRouter>
              </TenantProvider>
            </SubscriptionProvider>
          </FeatureProvider>
        </RegionalSettingsProvider>
      </TerminologyProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

/**
 * HomeRoute — public marketing homepage for anonymous users; authenticated
 * shop owners / managers are bounced to /dashboard via RequireAuth's logic.
 * Technicians and dispatchers go to their respective workspaces.
 */
const HomeRoute = () => {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Homepage />;
  return <LoadingScreen message="Opening your workspace..." />;
};

export const AppRoutes = () => {
  const { isValid: isTenant, loading: tenantLoading, slug: tenantSlug } = useTenant();
  const { shouldBlockRender: startupBlocking } = useStartupNavigation({ enabled: !isTenant });

  // Auto-update service worker on new deployments
  useServiceWorkerUpdate();

  useEffect(() => {
    setCurrentOfflineTenantSlug(tenantSlug ?? null);
  }, [tenantSlug]);

  // Phase 1 offline bootstrap: pull read-only snapshot into local DB when feature flag is enabled
  useOfflinePhase1Bootstrap();

  // Phase 2 outbox worker: continuously tries pending offline mutations with retry backoff
  useOfflineOutboxWorker();


  return (
    <>
      <SeoManager />
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      }>
        {/* Only tenant booking hosts wait for tenant resolution; normal app hosts render immediately. */}
        {tenantLoading || startupBlocking ? (
          <LoadingScreen message={startupBlocking ? "Opening your workspace..." : "Loading..."} />
        ) : (
        <Routes>
          <Route path="/voice-agent/:slug" element={<VoiceAgentEmbed />} />
          {isTenant ? (
            <>
              {/* Customer-facing pages accessible on tenant subdomains */}
              <Route path="/customer/dashboard" element={<CustomerDashboard />} />
              <Route path="/fleet-manager/auth" element={<CustomerAuth returnPath="/fleet-manager" />} />
              <Route path="/fleet-manager" element={<RequireAuth><RouteErrorBoundary section="Fleet Manager"><FleetManagerPortal /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/my-bookings" element={<Navigate to="/customer/dashboard" replace />} />
              <Route path="/customer/auth" element={<CustomerAuth />} />
              <Route path="/booking-success" element={<PaymentSuccess />} />
              <Route path="/messaging-preferences" element={<CustomerMessagingPreferences />} />
              <Route path="/services" element={<PublicServices tenantSlug={tenantSlug} />} />
              <Route path="/subscribe" element={<PublicSubscriptions tenantSlug={tenantSlug} />} />
              {/* Dedicated iframe endpoints receive a public-content-only CSP response. */}
              <Route path="/embed/services" element={<PublicServices tenantSlug={tenantSlug} embedded />} />
              <Route path="/embed/subscribe" element={<PublicSubscriptions tenantSlug={tenantSlug} embedded />} />
              <Route path="/embed/booking" element={<TenantBooking />} />
              {/* Catch-all: render the tenant booking flow */}
              <Route path="*" element={<TenantBooking />} />
            </>
          ) : (
            <>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />
              <Route path="/find-provider" element={<FindProvider />} />
              <Route path="/find-provider/:slug" element={<ProviderProfile />} />
              <Route path="/auth" element={<Navigate to="/login" replace />} />
              <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
              <Route path="/login" element={<LoginHub />} />
              <Route path="/login/business" element={<WorkforceAuth intent="login" variant="business" />} />
              <Route path="/login/dispatch" element={<WorkforceAuth intent="login" variant="dispatch" />} />
              <Route path="/login/technician" element={<WorkforceAuth intent="login" variant="technician" />} />
              <Route path="/login/admin" element={<Navigate to="/admin/login" replace />} />
              <Route path="/signup" element={<WorkforceAuth intent="signup" />} />
              <Route path="/signup/business" element={<Navigate to="/signup" replace />} />
              <Route path="/login/magic-link" element={<MagicLinkLogin />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/google-calendar/callback" element={<GoogleCalendarCallback />} />
              <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/about" element={<About />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/how-it-works" element={<HowItWorks />} />
              <Route path="/faqs" element={<Faqs />} />
              <Route path="/careers" element={<Careers />} />
              <Route path="/blog/all-features-showcase" element={<AllFeaturesShowcaseArticle />} />
              <Route path="/partner-program" element={<PartnerProgram />} />
              <Route path="/advertising-network" element={<AdvertisingNetwork />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/fair-price" element={<FairPriceCalculator />} />
              <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/white-glove-onboarding" element={<WhiteGloveOnboarding />} />
              <Route path="/insights" element={<InsightsFeed />} />
              <Route path="/insights/technical-article" element={<TechnicalArticle />} />
              {/* Plans upgrade page */}
              <Route path="/plans" element={<RequireAuth><Plans /></RequireAuth>} />
              {/* Core dashboard routes — isolated error boundary */}
              <Route path="/dashboard" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Dashboard /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/customers" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Customers /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/customers/:id" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><CustomerDetail /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/vehicles" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Vehicles /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/vehicles/:id" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><VehicleDetail /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/inventory" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Inventory /></RouteErrorBoundary></RequireAuth>} />
              {/* Fleet & dispatch routes — isolated error boundary */}
              <Route path="/fleet" element={<RequireAuth><RouteErrorBoundary section="Fleet"><Fleet /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/fleet/:id" element={<RequireAuth><RouteErrorBoundary section="Fleet"><VanDetail /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/team-os" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Team OS"><TechnicianOS /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/invitations" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Invitations"><InvitationCenter /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/technician-os" element={<RequireAuth><Navigate to="/team-os" replace /></RequireAuth>} />
              <Route path="/technician-os/profile" element={<RequireAuth><Navigate to="/team-os" replace /></RequireAuth>} />
              <Route path="/dispatch-engine" element={<RequireAuth><RouteErrorBoundary section="Fleet"><DispatchEngine /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/weather-guard" element={<RequireAuth><RouteErrorBoundary section="Fleet"><WeatherGuard /></RouteErrorBoundary></RequireAuth>} />
              {/* Fleet OS routes reinstated as first-class product surface */}
              <Route path="/fleet-os/*" element={<RequireAuth><RouteErrorBoundary section="Fleet"><FleetSchedulingPage /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/work-orders/:id" element={<RequireAuth><Navigate to="/appointments" replace /></RequireAuth>} />
              {/* Services & scheduling routes — isolated error boundary */}
              <Route path="/quotes" element={<RequireAuth><RouteErrorBoundary section="Services"><Quotes /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/command-center" element={<RequireAuth><RouteErrorBoundary section="Services"><CommandCenter /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/appointments" element={<RequireAuth><RouteErrorBoundary section="Services"><Appointments /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/appointments/:id" element={<RequireAuth><RouteErrorBoundary section="Services"><AppointmentDetail /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/services" element={<RequireAuth><RouteErrorBoundary section="Services"><Services /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/services/:id" element={<RequireAuth><RouteErrorBoundary section="Services"><ServiceDetail /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/service-catalog" element={<RequireAuth><RouteErrorBoundary section="Services"><ServiceCatalog /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/service-packages" element={<RequireAuth><RouteErrorBoundary section="Services"><ServicePackages /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/tire-pricing" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Services"><TirePricing /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/detailing-pricing" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Services"><DetailingPricing /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/subscriptions" element={<RequireAuth><RouteErrorBoundary section="Services"><Subscriptions /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/quick-service" element={<RequireAuth><RouteErrorBoundary section="Services"><QuickService /></RouteErrorBoundary></RequireAuth>} />
              {/* Settings & admin routes — isolated error boundary; admin-only */}
              <Route path="/field-companion" element={<RequireAuth><RouteErrorBoundary section="Field Companion"><FieldCompanion /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/settings/sessions" element={<RequireAuth><SessionManagement /></RequireAuth>} />
              <Route path="/agent-integrations" element={<RequireAuth><RouteErrorBoundary section="Settings"><AgentIntegrations /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/settings" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Settings /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/availability" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Availability /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/marketplace" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketplace"><MarketplaceHub /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/marketplace/:tab" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketplace"><MarketplaceHub /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/pricing-tool" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Job Pricing"><JobPricingTool /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              {/* Financials routes — isolated error boundary */}
              <Route path="/payments" element={<RequireAuth><RouteErrorBoundary section="Financials"><Payments /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/reports" element={<RequireAuth><RequirePlanFeature feature="has_invoicing_full"><RouteErrorBoundary section="Financials"><Reports /></RouteErrorBoundary></RequirePlanFeature></RequireAuth>} />
              <Route path="/financials" element={<RequireAuth><RouteErrorBoundary section="Financials"><Financials /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/expenses" element={<RequireAuth><RouteErrorBoundary section="Financials"><Expenses /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/invoices" element={<RequireAuth><RouteErrorBoundary section="Financials"><Invoices /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/operations" element={<RequireAuth><RouteErrorBoundary section="Financials"><Operations /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/tax-compliance" element={<RequireAuth><RouteErrorBoundary section="Financials"><TaxCompliance /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/messages" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Messages /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/receptionist" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Receptionist /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/assets" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Assets /></RouteErrorBoundary></RequireAuth>} />

              {/* Public feature education + authenticated growth workspace routes */}
              <Route path="/marketing" element={<RequireAuth><RouteErrorBoundary section="Marketing"><Marketing /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/growth-tools" element={<RequireAuth><RouteErrorBoundary section="Marketing"><Marketing /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/growth-tools/email-diagnostics" element={<RequireAuth><Navigate to="/growth-tools?tab=email-testing" replace /></RequireAuth>} />
              <Route path="/marketing-videos" element={<RequireAuth><RouteErrorBoundary section="Marketing"><MarketingVideos /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/newsletter" element={<RequireAuth><RouteErrorBoundary section="Marketing"><Newsletter /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/retention-engine" element={<RequireAuth><RouteErrorBoundary section="Marketing"><RetentionEngine /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/retention-verify" element={<RequireAuth><RouteErrorBoundary section="Marketing"><RetentionVerify /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/features-guide" element={<RouteErrorBoundary section="Marketing"><FeaturesGuide /></RouteErrorBoundary>} />
              <Route path="/features/:featureSlug" element={<RouteErrorBoundary section="Marketing"><FeatureDetail /></RouteErrorBoundary>} />
              <Route path="/vehicle-specs" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketing"><VehicleSpecs /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              {/* Legacy dispatcher URL now routes to the canonical daily operations view. */}
              <Route path="/dispatch" element={<RequireAuth><Navigate to="/command-center" replace /></RequireAuth>} />

              {/* 
                Subdomain-based booking: {slug}.servicewriter.xyz
                The TenantResolver handles subdomain detection automatically.
                No subdirectory routes needed - tenant detection happens at app load.
              */}
              <Route path="/booking-success" element={<PaymentSuccess />} />
              <Route path="/messaging-preferences" element={<CustomerMessagingPreferences />} />
              <Route path="/testimonial/:slug" element={<TestimonialSubmit />} />
              <Route path="/customer/auth" element={<CustomerAuth />} />
              <Route path="/customer/dashboard" element={<CustomerDashboard />} />
              <Route path="/fleet-manager/auth" element={<CustomerAuth returnPath="/fleet-manager" />} />
              <Route path="/fleet-manager" element={<RequireAuth><RouteErrorBoundary section="Fleet Manager"><FleetManagerPortal /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/my-bookings" element={<Navigate to="/customer/dashboard" replace />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              {/* Admin dashboard — double-gated: session + admin role from DB */}
              <Route path="/admin" element={<RequireRole role="admin" redirectTo="/admin/login"><RouteErrorBoundary section="Admin"><AdminDashboard /></RouteErrorBoundary></RequireRole>} />
              <Route path="/admin/plans" element={<RequireRole role="admin" redirectTo="/admin/login"><RouteErrorBoundary section="Admin"><AdminPlans /></RouteErrorBoundary></RequireRole>} />

              <Route path="/support" element={<SupportPage />} />
              <Route path="/knowledge-base" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><KnowledgeBase /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/knowledge-base/:categorySlug" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><KnowledgeBaseCategory /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/tutorials" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Tutorials /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/whats-new" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><WhatsNew /></RouteErrorBoundary></RequireAuth>} />
              {/* Team member routes */}
              <Route path="/team/login" element={<Navigate to="/login" replace />} />
              <Route path="/team/dashboard" element={<Navigate to="/tech-app" replace />} />
              <Route path="/invite/:token" element={<TeamJoin />} />
              <Route path="/team/join" element={<InvitationAccept />} />
              {/* Tech App - Field Technician Mobile App */}
              <Route path="/tech-app" element={<RequireAuth><RouteErrorBoundary section="Tech App"><TechAppLayout /></RouteErrorBoundary></RequireAuth>}>
                <Route index element={<TechToday />} />
                <Route path="jobs" element={<TechJobs />} />
                <Route path="fleet" element={<TechFleet />} />
                <Route path="jobs/:jobId" element={<TechJobDetail />} />
                <Route path="data-center" element={<TechDataCenter />} />
                <Route path="route" element={<TechRoute />} />
                <Route path="navigate/:jobId" element={<TechNavigation />} />
                <Route path="messages" element={<TechMessages />} />
                <Route path="more" element={<TechMore />} />
                <Route path="inventory" element={<TechInventory />} />
                <Route path="shift" element={<TechShift />} />
                <Route path="shift-review" element={<TechShiftReview />} />
                <Route path="profile" element={<TechProfile />} />
                <Route path="settings" element={<TechSettings />} />
                <Route path="services" element={<TechServices />} />
              </Route>
              {/* Public service and subscription signup */}
              <Route path="/public-services/:slug" element={<PublicServices />} />
              <Route path="/subscribe/:slug" element={<PublicSubscriptions />} />
              {/* Legacy redirect for old /book/:slug URLs */}
              <Route path="/book/:slug" element={<BookingRedirect />} />
              <Route path="*" element={<NotFound />} />
            </>
          )}
        </Routes>
        )}
      </Suspense>
      {!isTenant && (
        // Separate Suspense boundary — null fallback keeps the floating button invisible
        // while the chunk loads. The assistant is opened on user action, not on mount.
        <Suspense fallback={null}>
          <AIAssistant />
        </Suspense>
      )}
    </>
  );
};

const SeoManager = (): null => {
  const { pathname } = useLocation();

  useEffect(() => {
    const seoByPath: Record<string, { title: string; description: string }> = {
      "/": { title: "Service Writer | Mobile Mechanic Platform", description: "Service Writer helps mobile mechanics streamline booking, dispatch, diagnostics, and payment workflows." },
      "/pricing": { title: "Pricing | Service Writer", description: "Start free with Service Writer, then upgrade as your team grows with plans for solo mechanics, shops, and fleets." },
      "/about": { title: "About Us | Service Writer", description: "Learn how Service Writer was built by mechanics for mechanics." },
      "/blog": { title: "Blog | Service Writer", description: "Guides, product updates, and growth playbooks for mobile service teams." },
      "/how-it-works": { title: "How It Works | Service Writer", description: "See how Service Writer connects booking, dispatch, field service, payments, and customer follow-up in one mobile-first workflow." },
      "/faqs": { title: "FAQs | Service Writer", description: "Answers to common questions about Service Writer features, offline use, payments, messaging, booking, and data security." },
      "/careers": { title: "Careers | Service Writer", description: "Learn about the team building Service Writer and the roles we expect to hire for as we grow." },
      "/find-provider": { title: "Find a Service Provider | Service Writer", description: "Find mobile mechanics, independent shops, and fleet service teams using Service Writer public booking pages." },
      "/blog/all-features-showcase": { title: "The Complete Service Writer Feature Showcase for Mobile Auto Service Teams", description: "A full walkthrough of Service Writer features across scheduling, dispatch, payments, CRM, fleet, marketing, retention, reporting, and team operations." },
      "/contact": { title: "Contact Us | Service Writer", description: "Get sales help, onboarding guidance, partnership answers, and technical support from the Service Writer team." },
      "/fair-price": { title: "Auto Repair Fair-Price Calculator | Service Writer", description: "Audit vehicle repairs pricing instantly with our fair-market parts and labor cost estimator tool." },
      "/privacy-policy": { title: "Privacy Policy | Service Writer", description: "Read how Service Writer handles, protects, and governs personal and operational data." },
      "/terms": { title: "Terms of Service | Service Writer", description: "Review the terms governing use of Service Writer products and services." },
      "/security": { title: "Security | Service Writer", description: "Understand Service Writer security controls, safeguards, and vulnerability disclosure channels." },
      "/partner-program": { title: "Partner Program | Service Writer", description: "Join the Service Writer partner network for fleets, integrations, and reseller growth." },
      "/advertising-network": { title: "Collective Advertising Network | Service Writer", description: "Join the collective advertising network built for independent automotive service providers." },
      "/white-glove-onboarding": { title: "White Glove Onboarding | Service Writer", description: "Accelerate go-live with white glove onboarding, migration, and team enablement." },
      "/insights": { title: "Insights | Service Writer", description: "Technical insights, fleet strategy, and operational playbooks for modern service teams." },
      "/insights/technical-article": { title: "Technical Article | Service Writer", description: "Deep-dive technical guidance for fleet maintenance, diagnostics, and dispatch optimization." },
      "/support": { title: "Support | Service Writer", description: "Get help with Service Writer setup, troubleshooting, billing, booking pages, messaging, payments, and day-to-day workflows." },
      "/features-guide": { title: "Features Guide | Service Writer", description: "Explore Service Writer features for booking, dispatch, payments, customer management, fleet operations, marketing, and reporting." },
    };

    const SITE_URL = "https://servicewriter.xyz";

    const upsertMeta = (name: string, content: string) => {
      let node = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement("meta");
        node.name = name;
        document.head.appendChild(node);
      }
      node.content = content;
    };

    const upsertProperty = (property: string, content: string) => {
      let node = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement("meta");
        node.setAttribute("property", property);
        document.head.appendChild(node);
      }
      node.content = content;
    };

    const setCanonical = (href: string) => {
      let node = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!node) {
        node = document.createElement("link");
        node.rel = "canonical";
        document.head.appendChild(node);
      }
      node.href = href;
    };

    const dynamicPublicSeo =
      pathname.startsWith("/find-provider/") ||
      pathname.startsWith("/public-services/") ||
      pathname.startsWith("/subscribe/") ||
      pathname.startsWith("/book/");
    const marketingSeo = seoByPath[pathname];
    const isFeatureDetailPath = pathname.startsWith("/features/");
    const isIndexable = Boolean(marketingSeo) || isFeatureDetailPath || dynamicPublicSeo;
    const pageUrl = `${SITE_URL}${pathname === "/" ? "/" : pathname.replace(/\/+$/, "")}`;

    if (marketingSeo) {
      document.title = marketingSeo.title;
      upsertMeta("description", marketingSeo.description);
      upsertProperty("og:title", marketingSeo.title);
      upsertProperty("og:description", marketingSeo.description);
      upsertMeta("twitter:title", marketingSeo.title);
      upsertMeta("twitter:description", marketingSeo.description);
    }

    if (isIndexable) {
      upsertMeta("robots", "index,follow");
      // Canonical and og:url always self-reference the current route.
      setCanonical(pageUrl);
      upsertProperty("og:url", pageUrl);
      upsertProperty("og:image", `${SITE_URL}/og-image.png`);
      upsertMeta("twitter:url", pageUrl);
      upsertMeta("twitter:image", `${SITE_URL}/og-image.png`);
    } else {
      upsertMeta("robots", "noindex,nofollow");
    }
  }, [pathname]);

  return null;
};

export default App;
