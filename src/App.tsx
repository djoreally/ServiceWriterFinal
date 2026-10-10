
import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TerminologyProvider } from "@/contexts/TerminologyContext";
import { RegionalSettingsProvider } from "@/contexts/RegionalSettingsContext";
import { FeatureProvider } from "@/shared/features/feature.provider";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { useAuth } from "@packages/auth";
import { lazyRetry } from "./lib/lazyRetry";
import { LoadingScreen, RequireAuth, RequirePlanFeature, TenantLoadError } from "./components/routing/legacy-guards";
import { useSeoSync } from "./components/routing/useSeoSync";
// AIAssistant is lazy-loaded — it is a heavy, always-mounted component that only
// activates when opened. Deferring it removes it from the critical-path bundle.
const AIAssistant = lazyRetry(() =>
  import("./components/ai/AIAssistant").then((m) => ({ default: m.AIAssistant }))
);
import { useServiceWorkerUpdate } from "./hooks/useServiceWorkerUpdate";
import { RequireRole } from "./components/security/RequireRole";
import { RouteRoleGuard } from "./components/security/RouteRoleGuard";

import RouteErrorBoundary from "./shared/errors/RouteErrorBoundary";
import { useOfflinePhase1Bootstrap } from "./offline/useOfflinePhase1Bootstrap";
import { useOfflineOutboxWorker } from "./offline/useOfflineOutboxWorker";
import { setCurrentOfflineTenantSlug } from "./offline/rollout";
import { KeyboardShortcutsProvider } from "@/contexts/KeyboardShortcutsContext";
import { OfflineStatusBanner } from "@/components/offline/OfflineStatusBanner";
import { PostHogIdentity } from "@/components/analytics/PostHogIdentity";
import { useStartupNavigation } from "@/hooks/useStartupNavigation";

// `lazyRetry` lives in `./lib/lazyRetry` (shared with the App Router shell).
// `LoadingScreen` / `RequireAuth` live in `./components/routing/legacy-guards`
// (shared with the App Router shell).
// `SeoManager`'s DOM effect lives in `./components/routing/useSeoSync`.

const Homepage = lazyRetry(() => import("./legacy-pages/Homepage"));
const FindProvider = lazyRetry(() => import("./legacy-pages/FindProvider"));
const ProviderProfile = lazyRetry(() => import("./legacy-pages/ProviderProfile"));
const WorkforceAuth = lazyRetry(() => import("./legacy-pages/WorkforceAuth").then((module) => ({ default: module.WorkforceAuth })));
const LoginHub = lazyRetry(() => import("./legacy-pages/LoginHub"));
const OAuthConsent = lazyRetry(() => import("./legacy-pages/OAuthConsent"));
const Unsubscribe = lazyRetry(() => import("./legacy-pages/Unsubscribe"));
const Pricing = lazyRetry(() => import("./legacy-pages/Pricing"));
const Plans = lazyRetry(() => import("./legacy-pages/Plans"));
const About = lazyRetry(() => import("./legacy-pages/About"));
const Blog = lazyRetry(() => import("./legacy-pages/Blog"));
const HowItWorks = lazyRetry(() => import("./legacy-pages/HowItWorks"));
const Faqs = lazyRetry(() => import("./legacy-pages/Faqs"));
const Careers = lazyRetry(() => import("./legacy-pages/Careers"));
const AllFeaturesShowcaseArticle = lazyRetry(() => import("./legacy-pages/blog/AllFeaturesShowcaseArticle"));
const PrivacyPolicyPage = lazyRetry(() => import("./legacy-pages/legal/PrivacyPolicyPage"));
const TermsOfServicePage = lazyRetry(() => import("./legacy-pages/legal/TermsOfServicePage"));
const SecurityPage = lazyRetry(() => import("./legacy-pages/legal/SecurityPage"));
const PartnerProgram = lazyRetry(() => import("./legacy-pages/PartnerProgram"));
const AdvertisingNetwork = lazyRetry(() => import("./legacy-pages/AdvertisingNetwork"));
const ContactUs = lazyRetry(() => import("./legacy-pages/ContactUs"));
const FairPriceCalculator = lazyRetry(() => import("./legacy-pages/FairPriceCalculator"));
const WhiteGloveOnboarding = lazyRetry(() => import("./legacy-pages/WhiteGloveOnboarding"));
const InsightsFeed = lazyRetry(() => import("./legacy-pages/InsightsFeed"));
const TechnicalArticle = lazyRetry(() => import("./legacy-pages/TechnicalArticle"));
const Onboarding = lazyRetry(() => import("./legacy-pages/Onboarding"));
const ServicePackages = lazyRetry(() => import("./legacy-pages/ServicePackages"));
const Subscriptions = lazyRetry(() => import("./legacy-pages/Subscriptions"));
const AgentIntegrations = lazyRetry(() => import("./legacy-pages/AgentIntegrations"));
const Inventory = lazyRetry(() => import("./legacy-pages/Inventory"));
const Availability = lazyRetry(() => import("./legacy-pages/Availability"));
const MarketplaceHub = lazyRetry(() => import("./legacy-pages/MarketplaceHub"));
const JobPricingTool = lazyRetry(() => import("./legacy-pages/JobPricingTool"));
const TirePricing = lazyRetry(() => import("./legacy-pages/TirePricing"));
const DetailingPricing = lazyRetry(() => import("./legacy-pages/DetailingPricing"));

const TestimonialSubmit = lazyRetry(() => import("./legacy-pages/TestimonialSubmit"));
const AdminLogin = lazyRetry(() => import("./legacy-pages/admin/AdminLogin"));
const AdminDashboard = lazyRetry(() => import("./legacy-pages/admin/AdminDashboard"));
const AdminPlans = lazyRetry(() => import("./legacy-pages/admin/AdminPlans"));
const SupportPage = lazyRetry(() => import("./legacy-pages/SupportPage"));
const KnowledgeBase = lazyRetry(() => import("./legacy-pages/KnowledgeBase"));
const KnowledgeBaseCategory = lazyRetry(() => import("./legacy-pages/KnowledgeBaseCategory"));
const Tutorials = lazyRetry(() => import("./legacy-pages/Tutorials"));
const WhatsNew = lazyRetry(() => import("./legacy-pages/WhatsNew"));
const NotFound = lazyRetry(() => import("./legacy-pages/NotFound"));
const PublicServices = lazyRetry(() => import("./legacy-pages/PublicServices"));
const Reports = lazyRetry(() => import("./legacy-pages/Reports"));
const Financials = lazyRetry(() => import("./legacy-pages/Financials"));
const Expenses = lazyRetry(() => import("./legacy-pages/Expenses"));
const Operations = lazyRetry(() => import("./legacy-pages/Operations"));
const TaxCompliance = lazyRetry(() => import("./legacy-pages/TaxCompliance"));
const TeamJoin = lazyRetry(() => import("./legacy-pages/TeamJoin"));
const InvitationAccept = lazyRetry(() => import("./legacy-pages/InvitationAccept"));
const LegacyInviteRedirect = lazyRetry(() => import("./legacy-pages/LegacyInviteRedirect"));
const ForgotPassword = lazyRetry(() => import("./legacy-pages/ForgotPassword"));
const ResetPassword = lazyRetry(() => import("./legacy-pages/ResetPassword"));
const GoogleCalendarCallback = lazyRetry(() => import("./legacy-pages/GoogleCalendarCallback"));
const MagicLinkLogin = lazyRetry(() => import("./legacy-pages/MagicLinkLogin"));
const Messages = lazyRetry(() => import("./legacy-pages/Messages"));
const Receptionist = lazyRetry(() => import("./legacy-pages/Receptionist"));

const Assets = lazyRetry(() => import("./legacy-pages/Assets"));


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

// `LoadingScreen` and `RequireAuth` are imported from
// `./components/routing/legacy-guards` (shared with the App Router shell).
// Their implementations are unchanged.

// `RequirePlanFeature` is imported from `./components/routing/legacy-guards`
// (shared with the App Router shell). Its implementation is unchanged.

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
  const {
    loading: tenantLoading,
    slug: tenantSlug,
    error: tenantError,
    errorKind: tenantErrorKind,
    retry: retryTenant,
  } = useTenant();
  // Route by hostname resolution, not by successful tenant-profile lookup.
  // A valid tenant subdomain must never fall through to the platform marketing
  // homepage just because its profile is missing or the backend is unavailable.
  const isTenant = Boolean(tenantSlug);
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
        {/* Only tenant booking hosts wait for tenant resolution; normal app hosts render immediately.
            A failed tenant load never falls through to the routes or the marketing
            homepage — it renders a retryable error instead of a stuck spinner. */}
        {tenantLoading || startupBlocking ? (
          <LoadingScreen message={startupBlocking ? "Opening your workspace..." : "Loading..."} />
        ) : isTenant && tenantErrorKind ? (
          <TenantLoadError
            message={tenantError ?? undefined}
            notFound={tenantErrorKind === "not_found"}
            onRetry={retryTenant}
          />
        ) : (
        <Routes>
          {isTenant ? (
            <>
              <Route path="/services" element={<PublicServices tenantSlug={tenantSlug} />} />
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
              <Route path="/inventory" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Inventory /></RouteErrorBoundary></RequireAuth>} />
              {/* Services & scheduling routes — isolated error boundary */}
              <Route path="/service-packages" element={<RequireAuth><RouteErrorBoundary section="Services"><ServicePackages /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/tire-pricing" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Services"><TirePricing /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/detailing-pricing" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Services"><DetailingPricing /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/subscriptions" element={<RequireAuth><RouteErrorBoundary section="Services"><Subscriptions /></RouteErrorBoundary></RequireAuth>} />
              {/* Settings & admin routes — isolated error boundary; admin-only */}
              <Route path="/agent-integrations" element={<RequireAuth><RouteErrorBoundary section="Settings"><AgentIntegrations /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/availability" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Availability /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/marketplace" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketplace"><MarketplaceHub /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/marketplace/:tab" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Marketplace"><MarketplaceHub /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/pricing-tool" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Job Pricing"><JobPricingTool /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              {/* Financials routes — isolated error boundary */}
              <Route path="/reports" element={<RequireAuth><RequirePlanFeature feature="has_invoicing_full"><RouteErrorBoundary section="Financials"><Reports /></RouteErrorBoundary></RequirePlanFeature></RequireAuth>} />
              <Route path="/financials" element={<RequireAuth><RouteErrorBoundary section="Financials"><Financials /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/expenses" element={<RequireAuth><RouteErrorBoundary section="Financials"><Expenses /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/operations" element={<RequireAuth><RouteErrorBoundary section="Financials"><Operations /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/tax-compliance" element={<RequireAuth><RouteErrorBoundary section="Financials"><TaxCompliance /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/messages" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Messages /></RouteErrorBoundary></RequireAuth>} />
              <Route path="/receptionist" element={<RequireAuth><RouteRoleGuard><RouteErrorBoundary section="Settings"><Receptionist /></RouteErrorBoundary></RouteRoleGuard></RequireAuth>} />
              <Route path="/assets" element={<RequireAuth><RouteErrorBoundary section="Dashboard"><Assets /></RouteErrorBoundary></RequireAuth>} />


              {/*
                Subdomain-based booking: {slug}.servicewriter.xyz
                The TenantResolver handles subdomain detection automatically.
                No subdirectory routes needed - tenant detection happens at app load.
              */}
              <Route path="/testimonial/:slug" element={<TestimonialSubmit />} />
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
  useSeoSync(pathname);
  return null;
};

export default App;
