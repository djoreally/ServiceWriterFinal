import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { checkOnboardingStatus } from "@/application/queries/onboarding-check.query";
import { OnboardingWizard } from "@/components/onboarding";
import { Loader2 } from "lucide-react";

const Onboarding = () => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await checkOnboardingStatus();
        if (cancelled) return;
        setAuthenticated(Boolean(result.authenticated));
        setShouldShowOnboarding(Boolean(result.authenticated) && !result.onboardingCompleted);
      } catch (error) {
        console.error("Error checking onboarding status:", error);
        if (cancelled) return;
        // On error, do NOT force the wizard — let the caller's routing handle it.
        setAuthenticated(true);
        setShouldShowOnboarding(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  // Already onboarded — bounce to dashboard instead of rendering a blank screen.
  if (!shouldShowOnboarding) {
    return <Navigate to="/dashboard" replace />;
  }

  return <OnboardingWizard />;
};

export default Onboarding;
